/**
 * ========================================================
 * 存檔與資料同步模組 (save.js)
 * 負責玩家角色座標、偏好設定之雲端保存、自動存檔排程與提示字卡 (Toast)
 * ========================================================
 */

window.GameApp = window.GameApp || {};

(function () {
    // ================= 1. DOM 元素快取 =================
    const actionBtnSave = document.getElementById('btn-manual-save');
    const saveToast = document.getElementById('save-toast');
    const selectAutosave = document.getElementById('select-autosave');

    // ================= 2. 內部狀態管理 =================
    let autoSaveTimer = null;
    let currentAutoSaveInterval = 5000; // 預設自動存檔間隔：5 秒 (毫秒)
    let toastTimeout = null;
    let currentUserId = null; // 當前已登入之玩家 UID

    /**
     * 取得資料庫連線客戶端 (優先自 GameApp.auth 取得，亦支援全域 window.dbClient)
     */
    function getDbClient() {
        return (window.GameApp.auth && window.GameApp.auth.client) || window.dbClient || null;
    }

    /**
     * 取得角色物件
     */
    function getAvatar() {
        return (window.GameApp.game && window.GameApp.game.avatar) || window.avatar || null;
    }

    // ================= 3. 提示字卡 (Toast) 顯示邏輯 =================
    /**
     * 顯示浮動提示字卡
     * @param {string} message - 提示字卡訊息文字
     * @param {boolean} isError - 是否為錯誤提示 (若是則顯示紅色警示樣式)
     */
    function showSaveToast(message = '當前狀態已儲存', isError = false) {
        if (!saveToast) return;

        saveToast.textContent = message;
        saveToast.classList.remove('hidden', 'fade-out', 'toast-error');

        if (isError) {
            saveToast.classList.add('toast-error');
        }

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            saveToast.classList.add('fade-out');
            setTimeout(() => {
                saveToast.classList.add('hidden');
                saveToast.classList.remove('toast-error');
            }, 400);
        }, 2200);
    }

    // ================= 4. 核心存檔邏輯 =================
    /**
     * 儲存玩家當前座標與設定至 Supabase player_data 資料表
     * @param {boolean} isManual - 是否為手動觸發 (手動觸發時提示不同字樣)
     * @returns {Promise<boolean>} 存檔是否成功
     */
    async function savePlayerPosition(isManual = false) {
        const db = getDbClient();
        const hero = getAvatar();

        if (!hero || !currentUserId || !db) {
            return false;
        }

        try {
            if (isManual && actionBtnSave) {
                actionBtnSave.disabled = true;
                actionBtnSave.textContent = '💾 存檔中...';
            }

            const record = {
                id: currentUserId,
                pos_x: Math.round(hero.x),
                pos_y: Math.round(hero.y),
                autosave_interval: currentAutoSaveInterval,
                updated_at: new Date().toISOString()
            };

            const { error } = await db.from('player_data').upsert(record);

            if (error) {
                console.error('[SaveSystem] 雲端存檔失敗:', error.message);
                showSaveToast(`存檔失敗：${error.message || '請檢查網路連線'}`, true);
                return false;
            }

            showSaveToast(isManual ? '手動存檔完成！' : '當前進度已自動儲存', false);
            return true;
        } catch (err) {
            console.error('[SaveSystem] 存檔過程發生例外:', err);
            showSaveToast('存檔時發生非預期錯誤', true);
            return false;
        } finally {
            if (isManual && actionBtnSave) {
                actionBtnSave.disabled = false;
                actionBtnSave.textContent = '💾 手動存檔';
            }
        }
    }

    /**
     * 依據目前設定之時間間隔排程自動存檔定時器
     */
    function setupAutoSave() {
        if (autoSaveTimer) {
            clearInterval(autoSaveTimer);
            autoSaveTimer = null;
        }

        if (currentAutoSaveInterval > 0 && currentUserId) {
            autoSaveTimer = setInterval(() => {
                savePlayerPosition(false);
            }, currentAutoSaveInterval);
        }
    }

    // ================= 5. 使用者介面事件綁定 =================
    if (actionBtnSave) {
        actionBtnSave.addEventListener('click', () => {
            savePlayerPosition(true);
        });
    }

    if (selectAutosave) {
        selectAutosave.addEventListener('change', async (e) => {
            currentAutoSaveInterval = parseInt(e.target.value, 10);
            setupAutoSave();

            // 若目前已登入，立即將新偏好同步至資料庫
            if (currentUserId) {
                await savePlayerPosition(false);
            }
        });
    }

    // ================= 6. 提供給認證模組的生命週期介面 =================
    /**
     * 玩家登入時呼叫：載入遠端座標與存檔頻率偏好，並啟動自動存檔
     * @param {object} user - Supabase User 物件
     */
    async function initPlayerSync(user) {
        if (!user || !user.id) return;
        currentUserId = user.id;

        const db = getDbClient();
        if (!db) return;

        try {
            // 修復：必須一併查詢 autosave_interval，避免 undefined 造成型別錯誤
            const { data, error } = await db
                .from('player_data')
                .select('pos_x, pos_y, autosave_interval')
                .eq('id', user.id)
                .maybeSingle();

            if (error) {
                console.warn('[SaveSystem] 讀取存檔失敗或尚無紀錄:', error.message);
            }

            if (data) {
                // 還原角色位置
                if (window.GameApp.game && window.GameApp.game.setPosition) {
                    window.GameApp.game.setPosition(data.pos_x, data.pos_y);
                } else if (window.avatar) {
                    if (typeof data.pos_x === 'number') window.avatar.x = data.pos_x;
                    if (typeof data.pos_y === 'number') window.avatar.y = data.pos_y;
                }

                // 還原自動存檔間隔設定
                if (typeof data.autosave_interval === 'number' && !isNaN(data.autosave_interval)) {
                    currentAutoSaveInterval = data.autosave_interval;
                    if (selectAutosave) {
                        selectAutosave.value = data.autosave_interval.toString();
                    }
                }
            }
        } catch (err) {
            console.error('[SaveSystem] 初始化存檔資料時發生例外:', err);
        }

        // 啟動自動存檔排程
        setupAutoSave();
    }

    /**
     * 玩家登出時呼叫：清除定時器並將角色座標重設至起點
     */
    function clearPlayerSync() {
        currentUserId = null;

        if (autoSaveTimer) {
            clearInterval(autoSaveTimer);
            autoSaveTimer = null;
        }

        if (window.GameApp.game && window.GameApp.game.resetPosition) {
            window.GameApp.game.resetPosition();
        } else if (window.avatar) {
            const stage = document.getElementById('stage');
            if (stage) {
                window.avatar.x = stage.width / 2;
                window.avatar.y = stage.height / 2;
            }
            window.avatar.velX = 0;
            window.avatar.velY = 0;
        }
    }

    /**
     * 登出或重要事件前強制存檔
     */
    async function forceSavePlayer() {
        return await savePlayerPosition(false);
    }

    // ================= 7. 導出模組介面 =================
    const saveModule = {
        savePlayerPosition,
        initPlayerSync,
        clearPlayerSync,
        forceSavePlayer,
        showSaveToast,
        get currentUserId() { return currentUserId; },
        get autoSaveInterval() { return currentAutoSaveInterval; }
    };

    window.GameApp.save = saveModule;

    // 向下相容既有全域函式引用
    window.initPlayerSync = initPlayerSync;
    window.clearPlayerSync = clearPlayerSync;
    window.forceSavePlayer = forceSavePlayer;
})();
