// ================= 1. 初始化雲端連線 =================
const PROJECT_URL = 'https://obgktxdxkcgudbjrdjsj.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_hkbTESoRDihGzXuf_6fn8w_KR6QMKzm';
const dbClient = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);

// 取得網頁元素
const loginPanel = document.getElementById('login-panel');
const playArea = document.getElementById('play-area');
const emailField = document.getElementById('input-email');
const passField = document.getElementById('input-pass');
const statusText = document.getElementById('status-text');
const playerLabel = document.getElementById('player-label');

// ================= 2. 綁定註冊、登入與登出事件 =================
document.getElementById('btn-register').addEventListener('click', async () => {
    statusText.style.color = '#718093';
    statusText.textContent = '發送註冊請求中...';

    const { error } = await dbClient.auth.signUp({
        email: emailField.value,
        password: passField.value
    });

    if (error) {
        statusText.style.color = '#e84118';
        statusText.textContent = error.message;
    } else {
        statusText.style.color = '#44bd32';
        statusText.textContent = '註冊完成，系統已自動登入';
    }
});

document.getElementById('btn-signin').addEventListener('click', async () => {
    statusText.style.color = '#718093';
    statusText.textContent = '驗證身分中...';

    const { error } = await dbClient.auth.signInWithPassword({
        email: emailField.value,
        password: passField.value
    });

    if (error) {
        statusText.style.color = '#e84118';
        statusText.textContent = error.message;
    } else {
        statusText.textContent = '';
    }
});

document.getElementById('btn-signout').addEventListener('click', async () => {
    await dbClient.auth.signOut();
});

// ================= 3. 監聽登入狀態與切換畫面 =================
let loopHandle = null;

dbClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
        // 驗證通過：隱藏登入框，顯示畫布並啟動遊戲迴圈
        loginPanel.classList.add('hidden');
        playArea.classList.remove('hidden');
        playerLabel.textContent = `目前帳號：${session.user.email}`;

        if (!loopHandle) {
            gameLoop();
        }
    } else {
        // 未登入或已登出：顯示登入框，隱藏畫布並停止迴圈
        loginPanel.classList.remove('hidden');
        playArea.classList.add('hidden');

        if (loopHandle) {
            cancelAnimationFrame(loopHandle);
            loopHandle = null;
        }
    }
});

// ================= 4. 遊戲核心與移動邏輯 =================
const stage = document.getElementById('stage');
const pen = stage.getContext('2d');

const avatar = {
    x: stage.width / 2,
    y: stage.height / 2,
    size: 15,
    step: 5,
    fill: '#0097e6',
    velX: 0,
    velY: 0
};

function renderAvatar() {
    pen.beginPath();
    pen.arc(avatar.x, avatar.y, avatar.size, 0, Math.PI * 2);
    pen.fillStyle = avatar.fill;
    pen.fill();
    pen.closePath();
}

function gameLoop() {
    // 清除上一幀畫面
    pen.clearRect(0, 0, stage.width, stage.height);

    // 更新座標
    avatar.x += avatar.velX;
    avatar.y += avatar.velY;

    // 四周邊界碰撞限制
    if (avatar.x - avatar.size < 0) avatar.x = avatar.size;
    if (avatar.x + avatar.size > stage.width) avatar.x = stage.width - avatar.size;
    if (avatar.y - avatar.size < 0) avatar.y = avatar.size;
    if (avatar.y + avatar.size > stage.height) avatar.y = stage.height - avatar.size;

    // 繪製角色
    renderAvatar();

    // 持續執行下一幀
    loopHandle = requestAnimationFrame(gameLoop);
}

// 鍵盤控制監聽
window.addEventListener('keydown', (ev) => {
    const k = ev.key.toLowerCase();
    if (k === 'arrowright' || k === 'd') avatar.velX = avatar.step;
    if (k === 'arrowleft'  || k === 'a') avatar.velX = -avatar.step;
    if (k === 'arrowup'    || k === 'w') avatar.velY = -avatar.step;
    if (k === 'arrowdown'  || k === 's') avatar.velY = avatar.step;
});

window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    if (k === 'arrowright' || k === 'd' || k === 'arrowleft' || k === 'a') avatar.velX = 0;
    if (k === 'arrowup'    || k === 'w' || k === 'arrowdown' || k === 's') avatar.velY = 0;
});