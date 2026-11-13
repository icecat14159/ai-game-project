/**
 * ========================================================
 * 帳號認證與設定管理模組 (auth.js)
 * 負責 Supabase Auth 介面互動、帳號編碼轉換、密碼修改與登入狀態管理
 * ========================================================
 */

window.GameApp = window.GameApp || {};

(function () {
    // ================= 1. 雲端設定與客戶端初始化 =================
    const SUPABASE_CONFIG = {
        PROJECT_URL: 'https://obgktxdxkcgudbjrdjsj.supabase.co',
        PUBLISHABLE_KEY: 'sb_publishable_hkbTESoRDihGzXuf_6fn8w_KR6QMKzm'
    };

    if (!window.supabase) {
        console.error('[AuthModule] 找不到 Supabase SDK，請確認網路連線或 CDN 連結！');
        return;
    }

    const dbClient = window.supabase.createClient(
        SUPABASE_CONFIG.PROJECT_URL,
        SUPABASE_CONFIG.PUBLISHABLE_KEY
    );

    // ================= 2. DOM 元素快取 =================
    const elements = {
        // 浮動視窗
        authModal: document.getElementById('auth-modal'),
        settingsModal: document.getElementById('settings-modal'),
        
        // 頂部導覽列按鈕與標籤
        btnOpenAuth: document.getElementById('btn-open-auth'),
        btnCloseAuth: document.getElementById('btn-close-auth'),
        btnSettings: document.getElementById('btn-settings'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        btnSignout: document.getElementById('btn-signout'),
        btnManualSave: document.getElementById('btn-manual-save'),
        playerLabel: document.getElementById('player-label'),

        // 認證表單元素
        authForm: document.getElementById('auth-form'),
        tabLogin: document.getElementById('tab-login'),
        tabRegister: document.getElementById('tab-register'),
        inputAccount: document.getElementById('input-account'),
        inputPass: document.getElementById('input-pass'),
        inputPassConfirm: document.getElementById('input-pass-confirm'),
        btnSubmitAuth: document.getElementById('btn-submit-auth'),
        statusText: document.getElementById('status-text'),

        // 設定面板元素
        tabProfile: document.getElementById('tab-profile'),
        tabGameSettings: document.getElementById('tab-game-settings'),
        contentProfile: document.getElementById('content-profile'),
        contentGameSettings: document.getElementById('content-game-settings'),
        profileDisplayName: document.getElementById('profile-display-name'),
        passwordForm: document.getElementById('password-form'),
        inputOldPass: document.getElementById('input-old-pass'),
        inputNewPass: document.getElementById('input-new-pass'),
        inputNewPassConfirm: document.getElementById('input-new-pass-confirm'),
        btnChangePass: document.getElementById('btn-change-pass'),
        profileStatusText: document.getElementById('profile-status-text')
    };

    let currentAuthMode = 'login'; // 'login' | 'register'

    // ================= 3. 帳號轉換與錯誤訊息在地化 =================
    /**
     * 將使用者自訂帳號（可包含中文、特殊符號）轉換為合法虛擬 Email
     * Supabase Auth 預設需要 Email 格式，經由 UTF-8 Hex 編碼可避免特殊字元被拒絕
     */
    function encodeAccountToEmail(account) {
        const trimmed = account.trim();
        const utf8Bytes = new TextEncoder().encode(trimmed);
        const hex = Array.from(utf8Bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return `${hex}@game.local`;
    }

    /**
     * 將 Supabase 回傳之英文錯誤代碼轉譯為繁體中文友善提示
     */
    function translateAuthError(errorMsg) {
        if (!errorMsg) return '發生未知錯誤，請稍後再試。';
        const msg = errorMsg.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already exists')) {
            return '此帳號名稱已被註冊，請換一個名稱。';
        }
        if (msg.includes('invalid login credentials')) {
            return '帳號或密碼輸入錯誤，請重新確認。';
        }
        if (msg.includes('password should be at least')) {
            return '密碼強度不足：長度至少需為 6 個字元。';
        }
        if (msg.includes('new password should be different')) {
            return '新密碼不能與當前舊密碼相同。';
        }
        if (msg.includes('rate limit') || msg.includes('too many requests')) {
            return '操作過於頻繁，請稍候再試。';
        }
        if (msg.includes('failed to fetch') || msg.includes('network')) {
            return '無法連線至認證伺服器，請檢查網路連線。';
        }
        return errorMsg;
    }

    // ================= 4. 視窗顯示與頁籤切換 =================
    /**
     * 開關彈出視窗並同步更新遊戲輸入鎖定狀態
     */
    function toggleModal(modalElem, show) {
        if (!modalElem) return;
        if (show) {
            modalElem.classList.remove('hidden');
            window.isModalOpen = true;
            // 視窗開啟時強制煞車角色
            if (window.GameApp.game && window.GameApp.game.stopMovement) {
                window.GameApp.game.stopMovement();
            }
        } else {
            modalElem.classList.add('hidden');
            window.isModalOpen = false;
        }
    }

    /**
     * 切換登入 / 註冊頁籤
     */
    function setAuthMode(mode) {
        currentAuthMode = mode;
        elements.statusText.textContent = '';

        if (mode === 'login') {
            elements.tabLogin.classList.add('active');
            elements.tabRegister.classList.remove('active');
            elements.inputPassConfirm.classList.add('hidden');
            elements.inputPassConfirm.removeAttribute('required');
            elements.btnSubmitAuth.textContent = '登入';
            elements.btnSubmitAuth.style.backgroundColor = 'var(--primary)';
        } else {
            elements.tabRegister.classList.add('active');
            elements.tabLogin.classList.remove('active');
            elements.inputPassConfirm.classList.remove('hidden');
            elements.inputPassConfirm.setAttribute('required', 'true');
            elements.btnSubmitAuth.textContent = '註冊並綁定';
            elements.btnSubmitAuth.style.backgroundColor = 'var(--success)';
        }
    }

    // 視窗事件綁定
    elements.btnOpenAuth.addEventListener('click', () => {
        setAuthMode('login');
        toggleModal(elements.authModal, true);
        elements.inputAccount.focus();
    });

    elements.btnCloseAuth.addEventListener('click', () => {
        toggleModal(elements.authModal, false);
        elements.statusText.textContent = '';
    });

    elements.btnSettings.addEventListener('click', () => {
        toggleModal(elements.settingsModal, true);
        elements.profileStatusText.textContent = '';
    });

    elements.btnCloseSettings.addEventListener('click', () => {
        toggleModal(elements.settingsModal, false);
        elements.profileStatusText.textContent = '';
    });

    // 點擊彈窗外黑底遮罩時關閉視窗
    [elements.authModal, elements.settingsModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    toggleModal(modal, false);
                }
            });
        }
    });

    // 認證頁籤按鈕切換
    elements.tabLogin.addEventListener('click', () => setAuthMode('login'));
    elements.tabRegister.addEventListener('click', () => setAuthMode('register'));

    // 設定頁籤切換
    elements.tabProfile.addEventListener('click', () => {
        elements.tabProfile.classList.add('active');
        elements.tabGameSettings.classList.remove('active');
        elements.contentProfile.classList.add('active');
        elements.contentGameSettings.classList.remove('active');
    });

    elements.tabGameSettings.addEventListener('click', () => {
        elements.tabGameSettings.classList.add('active');
        elements.tabProfile.classList.remove('active');
        elements.contentGameSettings.classList.add('active');
        elements.contentProfile.classList.remove('active');
    });

    // ================= 5. 認證送出處理 =================
    async function handleAuthSubmit() {
        const rawAccount = elements.inputAccount.value.trim();
        const pass = elements.inputPass.value;
        const confirmPass = elements.inputPassConfirm.value;
        const statusText = elements.statusText;

        if (!rawAccount) {
            statusText.style.color = 'var(--danger)';
            statusText.textContent = '請輸入遊戲帳號！';
            elements.inputAccount.focus();
            return;
        }

        if (!pass) {
            statusText.style.color = 'var(--danger)';
            statusText.textContent = '請輸入密碼！';
            elements.inputPass.focus();
            return;
        }

        if (pass.length < 6) {
            statusText.style.color = 'var(--danger)';
            statusText.textContent = '密碼長度至少需為 6 位數！';
            elements.inputPass.focus();
            return;
        }

        const email = encodeAccountToEmail(rawAccount);

        // 設置按鈕防重複點擊狀態
        elements.btnSubmitAuth.disabled = true;
        const originalBtnText = elements.btnSubmitAuth.textContent;

        try {
            if (currentAuthMode === 'register') {
                if (pass !== confirmPass) {
                    statusText.style.color = 'var(--danger)';
                    statusText.textContent = '兩次輸入的密碼不一致！';
                    elements.inputPassConfirm.focus();
                    return;
                }

                statusText.style.color = 'var(--text-muted)';
                statusText.textContent = '帳號註冊中...';
                elements.btnSubmitAuth.textContent = '註冊中...';

                const { data, error } = await dbClient.auth.signUp({
                    email,
                    password: pass,
                    options: {
                        data: { display_name: rawAccount }
                    }
                });

                if (error) {
                    statusText.style.color = 'var(--danger)';
                    statusText.textContent = translateAuthError(error.message);
                } else if (data.session) {
                    statusText.style.color = 'var(--success)';
                    statusText.textContent = '註冊並綁定成功！';
                    setTimeout(() => toggleModal(elements.authModal, false), 600);
                } else {
                    statusText.style.color = 'var(--success)';
                    statusText.textContent = '註冊完成，正在登入...';
                }
            } else {
                statusText.style.color = 'var(--text-muted)';
                statusText.textContent = '登入驗證中...';
                elements.btnSubmitAuth.textContent = '登入中...';

                const { error } = await dbClient.auth.signInWithPassword({
                    email,
                    password: pass
                });

                if (error) {
                    statusText.style.color = 'var(--danger)';
                    statusText.textContent = translateAuthError(error.message);
                } else {
                    statusText.style.color = 'var(--success)';
                    statusText.textContent = '登入成功！';
                    setTimeout(() => toggleModal(elements.authModal, false), 400);
                }
            }
        } catch (err) {
            console.error('[AuthModule] 驗證失敗:', err);
            statusText.style.color = 'var(--danger)';
            statusText.textContent = '發生非預期錯誤，請檢查網路連線。';
        } finally {
            elements.btnSubmitAuth.disabled = false;
            elements.btnSubmitAuth.textContent = originalBtnText;
        }
    }

    if (elements.authForm) {
        elements.authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAuthSubmit();
        });
    }

    // ================= 6. 登出與強制存檔 =================
    elements.btnSignout.addEventListener('click', async () => {
        elements.btnSignout.disabled = true;
        try {
            // 登出前強制觸發最後一次存檔
            if (window.GameApp.save && window.GameApp.save.forceSavePlayer) {
                await window.GameApp.save.forceSavePlayer();
            } else if (window.forceSavePlayer) {
                await window.forceSavePlayer();
            }
            await dbClient.auth.signOut();
        } catch (err) {
            console.error('[AuthModule] 登出發生異常:', err);
        } finally {
            elements.btnSignout.disabled = false;
        }
    });

    // ================= 7. 變更密碼功能 =================
    async function handleChangePassword() {
        const oldPass = elements.inputOldPass.value;
        const newPass = elements.inputNewPass.value;
        const newPassConfirm = elements.inputNewPassConfirm.value;
        const pStatus = elements.profileStatusText;

        if (!oldPass || !newPass || !newPassConfirm) {
            pStatus.style.color = 'var(--danger)';
            pStatus.textContent = '請完整填寫所有密碼欄位！';
            return;
        }

        if (newPass.length < 6) {
            pStatus.style.color = 'var(--danger)';
            pStatus.textContent = '新密碼長度至少需為 6 個字元！';
            return;
        }

        if (newPass !== newPassConfirm) {
            pStatus.style.color = 'var(--danger)';
            pStatus.textContent = '新密碼兩次輸入不一致！';
            return;
        }

        pStatus.style.color = 'var(--text-muted)';
        pStatus.textContent = '舊密碼驗證中...';
        elements.btnChangePass.disabled = true;

        try {
            const { data: { session } } = await dbClient.auth.getSession();
            if (!session || !session.user) {
                pStatus.style.color = 'var(--danger)';
                pStatus.textContent = '目前尚未登入或登入憑證已失效。';
                return;
            }

            // 先使用舊密碼重新簽入以確認身分安全
            const { error: verifyError } = await dbClient.auth.signInWithPassword({
                email: session.user.email,
                password: oldPass
            });

            if (verifyError) {
                pStatus.style.color = 'var(--danger)';
                pStatus.textContent = '當前舊密碼輸入錯誤！';
                return;
            }

            pStatus.textContent = '密碼更新中...';
            const { error: updateError } = await dbClient.auth.updateUser({
                password: newPass
            });

            if (updateError) {
                pStatus.style.color = 'var(--danger)';
                pStatus.textContent = translateAuthError(updateError.message);
            } else {
                pStatus.style.color = 'var(--success)';
                pStatus.textContent = '密碼修改成功！';
                elements.inputOldPass.value = '';
                elements.inputNewPass.value = '';
                elements.inputNewPassConfirm.value = '';
            }
        } catch (err) {
            console.error('[AuthModule] 變更密碼異常:', err);
            pStatus.style.color = 'var(--danger)';
            pStatus.textContent = '變更密碼失敗，請稍後重試。';
        } finally {
            elements.btnChangePass.disabled = false;
        }
    }

    if (elements.passwordForm) {
        elements.passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleChangePassword();
        });
    }

    // ================= 8. 登入狀態監聽與 UI 同步 =================
    dbClient.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            const displayName = session.user.user_metadata?.display_name || '冒險者';

            elements.playerLabel.textContent = `玩家：${displayName}`;
            elements.btnSettings.classList.remove('hidden');
            elements.btnManualSave.classList.remove('hidden');
            elements.profileDisplayName.textContent = displayName;

            elements.btnOpenAuth.classList.add('hidden');
            elements.btnSignout.classList.remove('hidden');
            toggleModal(elements.authModal, false);

            // 呼叫 save 模組初始化座標讀取與自動存檔排程
            if (window.GameApp.save && window.GameApp.save.initPlayerSync) {
                await window.GameApp.save.initPlayerSync(session.user);
            } else if (window.initPlayerSync) {
                await window.initPlayerSync(session.user);
            }
        } else {
            elements.playerLabel.textContent = '目前狀態：遊客（未綁定）';
            elements.btnSettings.classList.add('hidden');
            elements.btnManualSave.classList.add('hidden');

            elements.btnOpenAuth.classList.remove('hidden');
            elements.btnSignout.classList.add('hidden');
            toggleModal(elements.settingsModal, false);

            // 呼叫 save 模組清除計時器並將角色重設至起點
            if (window.GameApp.save && window.GameApp.save.clearPlayerSync) {
                window.GameApp.save.clearPlayerSync();
            } else if (window.clearPlayerSync) {
                window.clearPlayerSync();
            }
        }
    });

    // ================= 9. 導出模組介面 =================
    const authModule = {
        client: dbClient,
        toggleModal,
        encodeAccountToEmail,
        translateAuthError
    };

    window.GameApp.auth = authModule;

    // 向下相容既有全域客戶端引用
    window.dbClient = dbClient;
})();
