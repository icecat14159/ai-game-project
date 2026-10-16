// ================= 1. 初始化雲端連線 =================
const PROJECT_URL = 'https://obgktxdxkcgudbjrdjsj.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_hkbTESoRDihGzXuf_6fn8w_KR6QMKzm';
const dbClient = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);

// DOM 元素
const authModal = document.getElementById('auth-modal');
const btnOpenAuth = document.getElementById('btn-open-auth');
const btnCloseAuth = document.getElementById('btn-close-auth');
const btnSignout = document.getElementById('btn-signout');
const accountField = document.getElementById('input-account');
const passField = document.getElementById('input-pass');
const statusText = document.getElementById('status-text');
const playerLabel = document.getElementById('player-label');

// 記錄目前是否打開了輸入視窗 (用來防止打字時觸發小人移動)
let isModalOpen = false;

// ================= 2. 彈出視窗開關控制 =================
function openModal() {
    isModalOpen = true;
    // 停止小人當前的移動慣性
    avatar.velX = 0;
    avatar.velY = 0;
    statusText.textContent = '';
    authModal.classList.remove('hidden');
    accountField.focus();
}

function closeModal() {
    isModalOpen = false;
    authModal.classList.add('hidden');
}

btnOpenAuth.addEventListener('click', openModal);
btnCloseAuth.addEventListener('click', closeModal);

// 點擊黑色半透明背景也可關閉視窗
authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeModal();
});

// ================= 3. 註冊、登入與登出事件 =================
// 將一般帳號轉成 Supabase 要求的信箱格式
function toFakeEmail(username) {
    return username.trim() + '@game.local';
}

document.getElementById('btn-register').addEventListener('click', async () => {
    const rawAccount = accountField.value.trim();
    if (!rawAccount) {
        statusText.textContent = '請輸入遊戲帳號';
        return;
    }

    statusText.style.color = '#718093';
    statusText.textContent = '綁定中...';

    const { error } = await dbClient.auth.signUp({
        email: toFakeEmail(rawAccount),
        password: passField.value
    });

    if (error) {
        statusText.style.color = '#e84118';
        statusText.textContent = error.message;
    } else {
        statusText.style.color = '#44bd32';
        statusText.textContent = '註冊綁定成功！';
        setTimeout(closeModal, 600);
    }
});

document.getElementById('btn-signin').addEventListener('click', async () => {
    const rawAccount = accountField.value.trim();
    if (!rawAccount) {
        statusText.textContent = '請輸入遊戲帳號';
        return;
    }

    statusText.style.color = '#718093';
    statusText.textContent = '驗證中...';

    const { error } = await dbClient.auth.signInWithPassword({
        email: toFakeEmail(rawAccount),
        password: passField.value
    });

    if (error) {
        statusText.style.color = '#e84118';
        statusText.textContent = '帳號或密碼錯誤';
    } else {
        closeModal();
    }
});

btnSignout.addEventListener('click', async () => {
    await dbClient.auth.signOut();
});

// ================= 4. 監聽登入狀態 (僅更新右上角資訊，不中斷遊戲) =================
dbClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
        // 已登入：把 @game.local 隱藏，只顯示玩家輸入的帳號名稱
        const displayId = session.user.email.replace('@game.local', '');
        playerLabel.textContent = `玩家帳號：${displayId} (已綁定)`;
        btnOpenAuth.classList.add('hidden');
        btnSignout.classList.remove('hidden');
    } else {
        // 未登入 (遊客模式)
        playerLabel.textContent = '狀態：遊客模式 (未綁定)';
        btnOpenAuth.classList.remove('hidden');
        btnSignout.classList.add('hidden');
    }
});

// ================= 5. 遊戲核心與移動邏輯 (一開網頁直接執行) =================
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
    pen.clearRect(0, 0, stage.width, stage.height);

    avatar.x += avatar.velX;
    avatar.y += avatar.velY;

    if (avatar.x - avatar.size < 0) avatar.x = avatar.size;
    if (avatar.x + avatar.size > stage.width) avatar.x = stage.width - avatar.size;
    if (avatar.y - avatar.size < 0) avatar.y = avatar.size;
    if (avatar.y + avatar.size > stage.height) avatar.y = stage.height - avatar.size;

    renderAvatar();

    requestAnimationFrame(gameLoop);
}

// 鍵盤控制監聽
window.addEventListener('keydown', (ev) => {
    // 若登入視窗開啟中，忽略遊戲移動按鍵，讓玩家正常打字
    if (isModalOpen) return;

    const k = ev.key.toLowerCase();
    if (k === 'arrowright' || k === 'd') avatar.velX = avatar.step;
    if (k === 'arrowleft'  || k === 'a') avatar.velX = -avatar.step;
    if (k === 'arrowup'    || k === 'w') avatar.velY = -avatar.step;
    if (k === 'arrowdown'  || k === 's') avatar.velY = avatar.step;
});

window.addEventListener('keyup', (ev) => {
    if (isModalOpen) return;

    const k = ev.key.toLowerCase();
    if (k === 'arrowright' || k === 'd' || k === 'arrowleft' || k === 'a') avatar.velX = 0;
    if (k === 'arrowup'    || k === 'w' || k === 'arrowdown' || k === 's') avatar.velY = 0;
});

// 網頁載入後立即啟動遊戲
gameLoop();