/**
 * ========================================================
 * 遊戲引擎模組 (game.js)
 * 負責 Canvas 畫布渲染、大地圖世界座標系、攝影機邊緣死區追蹤、
 * 響應式畫布大小管理與電腦鍵盤 + 手機虛擬方向鍵雙支援
 * ========================================================
 */

window.GameApp = window.GameApp || {};

(function () {
    const stage = document.getElementById('stage');
    const stageWrapper = document.querySelector('.stage-wrapper');
    const coordHud = document.getElementById('coord-hud');
    const pen = stage ? stage.getContext('2d') : null;

    if (!stage || !pen) {
        console.error('[GameEngine] 找不到 #stage 畫布元素！');
        return;
    }

    // ================= 1. 大地圖規格與攝影機設定 =================
    // 大地圖世界規格 (世界座標系：X: 0 ~ 2400, Y: 0 ~ 1800)
    const WORLD = {
        width: 2400,
        height: 1800,
        gridSize: 80,
        spawnX: 400,
        spawnY: 300
    };

    // 攝影機視口 (Camera Viewport)
    const camera = {
        x: 0,
        y: 0,
        width: stage.width,
        height: stage.height,
        // 邊緣觸發死區比例 (玩家移動接近螢幕邊緣 28% 時再滾動地圖)
        deadzoneRatioX: 0.28,
        deadzoneRatioY: 0.28
    };

    // ================= 2. 角色資產與狀態管理 =================
    const heroImg = new Image();
    heroImg.src = 'amiya.jpg';
    let isImageLoaded = false;

    heroImg.onload = () => {
        isImageLoaded = true;
    };

    heroImg.onerror = () => {
        console.warn('[GameEngine] 角色圖檔載入失敗，使用向量風格替代。');
        isImageLoaded = false;
    };

    /**
     * 動態設定角色頭像 (例如 Google 帳號頭像)
     */
    function setAvatarImage(url) {
        if (!url) return;
        const temp = new Image();
        temp.crossOrigin = 'anonymous';
        temp.onload = () => {
            heroImg.src = url;
            isImageLoaded = true;
        };
        temp.onerror = () => {
            console.warn('[GameEngine] 自訂頭像載入失敗，維持原圖。');
        };
        temp.src = url;
    }

    /**
     * 重設角色頭像為預設圖檔
     */
    function resetAvatarImage() {
        heroImg.src = 'amiya.jpg';
    }

    // 角色世界座標與物理屬性
    const avatar = {
        x: WORLD.spawnX,
        y: WORLD.spawnY,
        width: 46,
        height: 46,
        step: 5.5,
        velX: 0,
        velY: 0
    };

    // 鍵盤與虛擬控制鍵狀態集合
    const activeKeys = new Set();

    // 虛擬搖桿方向向量
    const virtualInput = { x: 0, y: 0 };

    // ================= 3. 畫布響應式自適應 =================
    /**
     * 依據容器與螢幕尺寸動態調整 Canvas 畫布尺寸，避免手機端畫面被壓縮變形
     */
    function resizeCanvas() {
        if (!stageWrapper) return;

        const rect = stageWrapper.getBoundingClientRect();
        // 限制電腦最大尺寸為 860x600，手機則佔滿可用視窗寬度與高度
        const isMobile = window.innerWidth <= 768;
        const targetWidth = Math.floor(isMobile ? rect.width : Math.min(rect.width, 860));
        const targetHeight = Math.floor(isMobile ? rect.height : Math.min(rect.height, 600));

        if (targetWidth > 0 && targetHeight > 0) {
            stage.width = targetWidth;
            stage.height = targetHeight;
            camera.width = targetWidth;
            camera.height = targetHeight;
        }

        // 重新計算攝影機視口
        updateCamera(true);
    }

    // ================= 4. 攝影機死區追蹤邏輯 =================
    /**
     * 更新攝影機位置：保持玩家為中心，當玩家接近螢幕邊緣時才平滑移動攝影機
     * @param {boolean} immediate - 是否立即置中校正
     */
    function updateCamera(immediate = false) {
        // 計算螢幕邊緣死區邊界 (Marginal Deadzone)
        const marginX = Math.min(camera.width * camera.deadzoneRatioX, 220);
        const marginY = Math.min(camera.height * camera.deadzoneRatioY, 170);

        if (immediate) {
            // 立即將攝影機以玩家為中心校正
            camera.x = avatar.x - camera.width / 2;
            camera.y = avatar.y - camera.height / 2;
        } else {
            // 當前角色在螢幕上的投影座標
            const screenX = avatar.x - camera.x;
            const screenY = avatar.y - camera.y;

            // 接近左側邊緣 -> 攝影機向左推移
            if (screenX < marginX) {
                camera.x = avatar.x - marginX;
            }
            // 接近右側邊緣 -> 攝影機向右推移
            else if (screenX > camera.width - marginX) {
                camera.x = avatar.x - (camera.width - marginX);
            }

            // 接近頂部邊緣 -> 攝影機向上推移
            if (screenY < marginY) {
                camera.y = avatar.y - marginY;
            }
            // 接近底部邊緣 -> 攝影機向下推移
            else if (screenY > camera.height - marginY) {
                camera.y = avatar.y - (camera.height - marginY);
            }
        }

        // 大地圖邊界限制：攝影機不移出大地圖範圍
        if (camera.width >= WORLD.width) {
            camera.x = (WORLD.width - camera.width) / 2;
        } else {
            camera.x = Math.max(0, Math.min(WORLD.width - camera.width, camera.x));
        }

        if (camera.height >= WORLD.height) {
            camera.y = (WORLD.height - camera.height) / 2;
        } else {
            camera.y = Math.max(0, Math.min(WORLD.height - camera.height, camera.y));
        }
    }

    // ================= 5. 角色運動與邊界判定 =================
    /**
     * 重設角色座標至初始位置
     */
    function resetPosition() {
        avatar.x = WORLD.spawnX;
        avatar.y = WORLD.spawnY;
        stopMovement();
        updateCamera(true);
    }

    /**
     * 停止所有移動
     */
    function stopMovement() {
        activeKeys.clear();
        virtualInput.x = 0;
        virtualInput.y = 0;
        avatar.velX = 0;
        avatar.velY = 0;
    }

    /**
     * 設定角色世界座標
     */
    function setPosition(x, y) {
        if (typeof x === 'number' && !isNaN(x)) {
            const halfW = avatar.width / 2;
            avatar.x = Math.max(halfW, Math.min(WORLD.width - halfW, x));
        }
        if (typeof y === 'number' && !isNaN(y)) {
            const halfH = avatar.height / 2;
            avatar.y = Math.max(halfH, Math.min(WORLD.height - halfH, y));
        }
        updateCamera(true);
    }

    /**
     * 更新角色物理位移 (合併鍵盤與觸控方向輸入)
     */
    function updatePhysics() {
        if (window.isModalOpen) {
            stopMovement();
            return;
        }

        let dirX = virtualInput.x;
        let dirY = virtualInput.y;

        // 鍵盤方向疊加
        if (activeKeys.has('arrowleft') || activeKeys.has('a')) dirX -= 1;
        if (activeKeys.has('arrowright') || activeKeys.has('d')) dirX += 1;
        if (activeKeys.has('arrowup') || activeKeys.has('w')) dirY -= 1;
        if (activeKeys.has('arrowdown') || activeKeys.has('s')) dirY += 1;

        // 限制在 -1 ~ 1
        dirX = Math.max(-1, Math.min(1, dirX));
        dirY = Math.max(-1, Math.min(1, dirY));

        // 斜角等速校正
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

        // 大地圖邊界限制
        const halfW = avatar.width / 2;
        const halfH = avatar.height / 2;
        if (avatar.x - halfW < 0) avatar.x = halfW;
        if (avatar.x + halfW > WORLD.width) avatar.x = WORLD.width - halfW;
        if (avatar.y - halfH < 0) avatar.y = halfH;
        if (avatar.y + halfH > WORLD.height) avatar.y = WORLD.height - halfH;

        // 推進攝影機
        updateCamera(false);

        // 更新頂部 HUD 座標顯示
        if (coordHud) {
            coordHud.textContent = `📍 X: ${Math.round(avatar.x)}, Y: ${Math.round(avatar.y)}`;
        }
    }

    // ================= 6. 畫布繪製系統 =================
    /**
     * 繪製大地圖網格背景與地標地圖裝飾
     */
    function renderWorldEnvironment() {
        // 1. 背景底色
        pen.fillStyle = '#222f3e';
        pen.fillRect(0, 0, WORLD.width, WORLD.height);

        // 2. 繪製微細網格線
        pen.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        pen.lineWidth = 1;

        // 僅繪製攝影機可視範圍內的網格以提高效能
        const startX = Math.floor(camera.x / WORLD.gridSize) * WORLD.gridSize;
        const endX = Math.min(WORLD.width, camera.x + camera.width + WORLD.gridSize);
        const startY = Math.floor(camera.y / WORLD.gridSize) * WORLD.gridSize;
        const endY = Math.min(WORLD.height, camera.y + camera.height + WORLD.gridSize);

        pen.beginPath();
        for (let x = startX; x <= endX; x += WORLD.gridSize) {
            pen.moveTo(x, startY);
            pen.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += WORLD.gridSize) {
            pen.moveTo(startX, y);
            pen.lineTo(endX, y);
        }
        pen.stroke();

        // 3. 繪製起始城鎮中央廣場 (裝飾地標)
        pen.save();
        pen.fillStyle = 'rgba(0, 151, 230, 0.12)';
        pen.strokeStyle = 'rgba(0, 151, 230, 0.4)';
        pen.lineWidth = 3;
        pen.beginPath();
        pen.arc(400, 300, 140, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();

        pen.font = '12px ' + getComputedStyle(document.body).fontFamily;
        pen.fillStyle = 'rgba(255, 255, 255, 0.45)';
        pen.textAlign = 'center';
        pen.fillText('🏛️ 起始營地廣場 (400, 300)', 400, 305);

        // 東方探險林區地標
        pen.fillStyle = 'rgba(68, 189, 50, 0.1)';
        pen.strokeStyle = 'rgba(68, 189, 50, 0.35)';
        pen.beginPath();
        pen.arc(1400, 600, 180, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();
        pen.fillStyle = 'rgba(255, 255, 255, 0.45)';
        pen.fillText('🌲 綠意密林探索區 (1400, 600)', 1400, 605);

        // 南方水晶礦湖地標
        pen.fillStyle = 'rgba(156, 136, 255, 0.1)';
        pen.strokeStyle = 'rgba(156, 136, 255, 0.35)';
        pen.beginPath();
        pen.arc(1600, 1300, 190, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();
        pen.fillStyle = 'rgba(255, 255, 255, 0.45)';
        pen.fillText('💎 水晶之湖 (1600, 1300)', 1600, 1305);
        pen.restore();

        // 4. 大地圖外圍警示邊界邊框 (World Boundaries)
        pen.save();
        pen.strokeStyle = '#e84118';
        pen.lineWidth = 4;
        pen.strokeRect(2, 2, WORLD.width - 4, WORLD.height - 4);

        // 四角邊界文字
        pen.font = 'bold 12px sans-serif';
        pen.fillStyle = '#e84118';
        pen.textAlign = 'left';
        pen.fillText('⚠️ 世界邊界 (0, 0)', 14, 24);
        pen.textAlign = 'right';
        pen.fillText(`⚠️ 世界邊界 (${WORLD.width}, ${WORLD.height})`, WORLD.width - 14, WORLD.height - 14);
        pen.restore();
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
        pen.ellipse(avatar.x, avatar.y + halfH - 2, halfW * 0.75, 6, 0, 0, Math.PI * 2);
        pen.fillStyle = 'rgba(0, 0, 0, 0.28)';
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
            // 向量風格備用小人
            pen.beginPath();
            pen.arc(avatar.x, avatar.y, 18, 0, Math.PI * 2);
            pen.fillStyle = '#0097e6';
            pen.fill();
            pen.lineWidth = 3;
            pen.strokeStyle = '#ffffff';
            pen.stroke();
            pen.closePath();
        }

        // 角色腳下座標微型光環 (讓玩家在世界中極其清晰)
        pen.save();
        pen.strokeStyle = 'rgba(75, 207, 250, 0.45)';
        pen.lineWidth = 1.5;
        pen.beginPath();
        pen.arc(avatar.x, avatar.y + halfH - 2, halfW * 0.85, 0, Math.PI * 2);
        pen.stroke();
        pen.restore();
    }

    /**
     * 核心渲染迴圈
     */
    function gameLoop() {
        updatePhysics();

        pen.clearRect(0, 0, stage.width, stage.height);

        // 攝影機視口轉換：將畫布原點平移至 -camera.x, -camera.y
        pen.save();
        pen.translate(-Math.round(camera.x), -Math.round(camera.y));

        renderWorldEnvironment();
        renderAvatar();

        pen.restore();

        requestAnimationFrame(gameLoop);
    }

    // ================= 7. 鍵盤事件監聽 (電腦操作) =================
    const VALID_KEYS = new Set([
        'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
        'w', 'a', 's', 'd'
    ]);

    window.addEventListener('keydown', (ev) => {
        if (window.isModalOpen) return;

        const k = ev.key.toLowerCase();
        if (VALID_KEYS.has(k)) {
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

    window.addEventListener('blur', () => {
        stopMovement();
    });

    // ================= 8. 手機虛擬控制方向鍵監聽 (觸控操作) =================
    function setupTouchControls() {
        const dpadBtns = document.querySelectorAll('.dpad-btn');
        if (!dpadBtns || dpadBtns.length === 0) return;

        dpadBtns.forEach(btn => {
            const dir = btn.dataset.dir;

            const handlePress = (e) => {
                e.preventDefault();
                btn.classList.add('pressed');
                if (dir === 'up') virtualInput.y = -1;
                if (dir === 'down') virtualInput.y = 1;
                if (dir === 'left') virtualInput.x = -1;
                if (dir === 'right') virtualInput.x = 1;
            };

            const handleRelease = (e) => {
                e.preventDefault();
                btn.classList.remove('pressed');
                if (dir === 'up' && virtualInput.y < 0) virtualInput.y = 0;
                if (dir === 'down' && virtualInput.y > 0) virtualInput.y = 0;
                if (dir === 'left' && virtualInput.x < 0) virtualInput.x = 0;
                if (dir === 'right' && virtualInput.x > 0) virtualInput.x = 0;
            };

            btn.addEventListener('pointerdown', handlePress);
            btn.addEventListener('pointerup', handleRelease);
            btn.addEventListener('pointercancel', handleRelease);
            btn.addEventListener('pointerleave', handleRelease);
        });

        // 額外支援：在畫布上直接滑動/拖曳也可以直接引導角色移動
        let touchStartPos = null;
        stage.addEventListener('pointerdown', (e) => {
            if (window.isModalOpen) return;
            touchStartPos = { x: e.clientX, y: e.clientY };
        }, { passive: true });

        window.addEventListener('pointermove', (e) => {
            if (!touchStartPos) return;
            const dx = e.clientX - touchStartPos.x;
            const dy = e.clientY - touchStartPos.y;
            const dist = Math.hypot(dx, dy);

            // 若拖動超過一定閥值，引導角色往該方向移動
            if (dist > 15) {
                virtualInput.x = dx / dist;
                virtualInput.y = dy / dist;
            }
        }, { passive: true });

        const endCanvasTouch = () => {
            if (touchStartPos) {
                touchStartPos = null;
                // 如果目前沒有在按虛擬 D-pad 按鈕，重設速度
                const anyPressed = document.querySelector('.dpad-btn.pressed');
                if (!anyPressed) {
                    virtualInput.x = 0;
                    virtualInput.y = 0;
                }
            }
        };

        window.addEventListener('pointerup', endCanvasTouch, { passive: true });
        window.addEventListener('pointercancel', endCanvasTouch, { passive: true });
    }

    // ================= 9. 初始化與介面導出 =================
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);

    // 啟動自適應畫布與觸控設置
    resizeCanvas();
    setupTouchControls();

    // 啟動遊戲主迴圈
    gameLoop();

    // 導出模組介面
    const gameModule = {
        avatar,
        stage,
        camera,
        world: WORLD,
        stopMovement,
        resetPosition,
        setPosition,
        resizeCanvas,
        updateCamera,
        setAvatarImage,
        resetAvatarImage
    };

    window.GameApp.game = gameModule;

    // 向下相容既有全域存取
    window.avatar = avatar;
    window.isModalOpen = false;
})();
