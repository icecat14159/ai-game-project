/**
 * ========================================================
 * 遊戲引擎模組 (game.js)
 * 負責 Canvas 畫布渲染、角色物理更新、邊界判定與流暢按鍵監聽
 * ========================================================
 */

// 建立全域 GameApp 命名空間，便於模組化維護並防止全域污染
window.GameApp = window.GameApp || {};

(function () {
    const stage = document.getElementById('stage');
    const pen = stage ? stage.getContext('2d') : null;

    if (!stage || !pen) {
        console.error('[GameEngine] 找不到 #stage 畫布元素！');
        return;
    }

    // 角色圖檔載入管理
    const heroImg = new Image();
    heroImg.src = 'amiya.jpg';
    let isImageLoaded = false;

    heroImg.onload = () => {
        isImageLoaded = true;
    };

    heroImg.onerror = () => {
        console.warn('[GameEngine] 角色圖檔載入失敗，將使用預設向量圖案替代。');
        isImageLoaded = false;
    };

    // 核心角色狀態物件
    const avatar = {
        x: stage.width / 2,
        y: stage.height / 2,
        width: 44,
        height: 44,
        step: 5,
        velX: 0,
        velY: 0
    };

    // 鍵盤狀態記錄集合 (以 Set 儲存當前正被按住的按鍵，解決按鍵互卡與鬼畜滑動)
    const activeKeys = new Set();

    /**
     * 重置按鍵與移動速度 (用於視窗彈出、切換分頁或失去焦點時)
     */
    function stopMovement() {
        activeKeys.clear();
        avatar.velX = 0;
        avatar.velY = 0;
    }

    /**
     * 重設角色座標至畫布正中央
     */
    function resetPosition() {
        avatar.x = stage.width / 2;
        avatar.y = stage.height / 2;
        stopMovement();
    }

    /**
     * 設定角色座標並進行邊界安全檢查
     * @param {number} x - 目標 X 座標
     * @param {number} y - 目標 Y 座標
     */
    function setPosition(x, y) {
        if (typeof x === 'number' && !isNaN(x)) {
            const halfW = avatar.width / 2;
            avatar.x = Math.max(halfW, Math.min(stage.width - halfW, x));
        }
        if (typeof y === 'number' && !isNaN(y)) {
            const halfH = avatar.height / 2;
            avatar.y = Math.max(halfH, Math.min(stage.height - halfH, y));
        }
    }

    /**
     * 繪製角色本體與陰影
     */
    function renderAvatar() {
        const halfW = avatar.width / 2;
        const halfH = avatar.height / 2;

        // 繪製角色腳底微陰影
        pen.save();
        pen.beginPath();
        pen.ellipse(avatar.x, avatar.y + halfH - 2, halfW * 0.7, 5, 0, 0, Math.PI * 2);
        pen.fillStyle = 'rgba(0, 0, 0, 0.18)';
        pen.fill();
        pen.restore();

        if (isImageLoaded) {
            // 繪製頭像圖檔
            pen.drawImage(
                heroImg,
                avatar.x - halfW,
                avatar.y - halfH,
                avatar.width,
                avatar.height
            );
        } else {
            // 備用樣式：藍色小球與白色外框
            pen.beginPath();
            pen.arc(avatar.x, avatar.y, 16, 0, Math.PI * 2);
            pen.fillStyle = '#0097e6';
            pen.fill();
            pen.lineWidth = 3;
            pen.strokeStyle = '#ffffff';
            pen.stroke();
            pen.closePath();
        }
    }

    /**
     * 更新角色移動速度 (依據目前 activeKeys 支援斜向等速移動)
     */
    function updatePhysics() {
        if (window.isModalOpen) {
            stopMovement();
            return;
        }

        let dirX = 0;
        let dirY = 0;

        if (activeKeys.has('arrowleft') || activeKeys.has('a')) dirX -= 1;
        if (activeKeys.has('arrowright') || activeKeys.has('d')) dirX += 1;
        if (activeKeys.has('arrowup') || activeKeys.has('w')) dirY -= 1;
        if (activeKeys.has('arrowdown') || activeKeys.has('s')) dirY += 1;

        // 斜角等速校正 (避免斜走比直走快 1.414 倍)
        if (dirX !== 0 && dirY !== 0) {
            const invSqrt2 = 0.70710678;
            avatar.velX = dirX * avatar.step * invSqrt2;
            avatar.velY = dirY * avatar.step * invSqrt2;
        } else {
            avatar.velX = dirX * avatar.step;
            avatar.velY = dirY * avatar.step;
        }

        avatar.x += avatar.velX;
        avatar.y += avatar.velY;

        // 畫布邊界限制
        const halfW = avatar.width / 2;
        const halfH = avatar.height / 2;
        if (avatar.x - halfW < 0) avatar.x = halfW;
        if (avatar.x + halfW > stage.width) avatar.x = stage.width - halfW;
        if (avatar.y - halfH < 0) avatar.y = halfH;
        if (avatar.y + halfH > stage.height) avatar.y = stage.height - halfH;
    }

    /**
     * 核心渲染迴圈
     */
    function gameLoop() {
        pen.clearRect(0, 0, stage.width, stage.height);

        updatePhysics();
        renderAvatar();

        requestAnimationFrame(gameLoop);
    }

    // ================= 鍵盤事件監聽 =================
    const VALID_KEYS = new Set([
        'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
        'w', 'a', 's', 'd'
    ]);

    window.addEventListener('keydown', (ev) => {
        if (window.isModalOpen) return;

        const k = ev.key.toLowerCase();
        if (VALID_KEYS.has(k)) {
            // 防止按下方向鍵時瀏覽器滾動頁面
            if (k.startsWith('arrow')) {
                ev.preventDefault();
            }
            activeKeys.add(k);
        }
    });

    window.addEventListener('keyup', (ev) => {
        const k = ev.key.toLowerCase();
        activeKeys.delete(k);
    });

    // 當瀏覽器失去焦點或切換分頁時，自動停止角色移動，避免持續走動
    window.addEventListener('blur', () => {
        stopMovement();
    });

    // 啟動遊戲主迴圈
    gameLoop();

    // ================= 導出介面 =================
    const gameModule = {
        avatar,
        stage,
        stopMovement,
        resetPosition,
        setPosition
    };

    window.GameApp.game = gameModule;

    // 向下相容既有全域存取
    window.avatar = avatar;
    window.isModalOpen = false;
})();
