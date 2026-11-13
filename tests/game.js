// ================= game.js =================
const stage = document.getElementById('stage');
const pen = stage.getContext('2d');

// 建立角色圖片物件
const heroImg = new Image();
heroImg.src = 'amiya.jpg'; //主控角色圖檔
let isImageLoaded = false;

heroImg.onload = () => {
    isImageLoaded = true;
};

// 將角色物件綁定到 window，讓 auth.js 可以存取它 (用來在開啟視窗時強制煞車)
window.avatar = {
    x: stage.width / 2,
    y: stage.height / 2,
    width: 40,
    height: 40,
    step: 5,
    velX: 0,
    velY: 0
};

function renderAvatar() {
    if (isImageLoaded) {
        pen.drawImage(
            heroImg, 
            window.avatar.x - window.avatar.width / 2, 
            window.avatar.y - window.avatar.height / 2, 
            window.avatar.width, 
            window.avatar.height
        );
    } else {
        pen.beginPath();
        pen.arc(window.avatar.x, window.avatar.y, 15, 0, Math.PI * 2);
        pen.fillStyle = '#0097e6';
        pen.fill();
        pen.closePath();
    }
}

function gameLoop() {
    pen.clearRect(0, 0, stage.width, stage.height);

    window.avatar.x += window.avatar.velX;
    window.avatar.y += window.avatar.velY;

    const halfW = window.avatar.width / 2;
    const halfH = window.avatar.height / 2;
    if (window.avatar.x - halfW < 0) window.avatar.x = halfW;
    if (window.avatar.x + halfW > stage.width) window.avatar.x = stage.width - halfW;
    if (window.avatar.y - halfH < 0) window.avatar.y = halfH;
    if (window.avatar.y + halfH > stage.height) window.avatar.y = stage.height - halfH;

    renderAvatar();
    requestAnimationFrame(gameLoop);
}

// 鍵盤控制：讀取 auth.js 設定的 window.isModalOpen 變數，若開啟則忽略指令
window.addEventListener('keydown', (ev) => {
    if (window.isModalOpen) return;

    const k = ev.key.toLowerCase();
    if (k === 'arrowright' || k === 'd') window.avatar.velX = window.avatar.step;
    if (k === 'arrowleft'  || k === 'a') window.avatar.velX = -window.avatar.step;
    if (k === 'arrowup'    || k === 'w') window.avatar.velY = -window.avatar.step;
    if (k === 'arrowdown'  || k === 's') window.avatar.velY = window.avatar.step;
});

window.addEventListener('keyup', (ev) => {
    if (window.isModalOpen) return;

    const k = ev.key.toLowerCase();
    if (k === 'arrowright' || k === 'd' || k === 'arrowleft' || k === 'a') window.avatar.velX = 0;
    if (k === 'arrowup'    || k === 'w' || k === 'arrowdown' || k === 's') window.avatar.velY = 0;
});

// 網頁載入後直接啟動遊戲
gameLoop();