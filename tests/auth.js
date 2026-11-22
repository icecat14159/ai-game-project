/**
 * ========================================================
 * 帳號認證與設定管理模組 (auth.js)
 * 負責 Supabase Auth 介面互動、帳號編碼轉換、密碼修改、
 * Google 第三方快速登入與登入狀態管理
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

        // Google 第三方快速登入按鈕
        btnGoogleAuth: document.getElementById('btn-google-auth'),

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
        profileAccountStatus: document.getElementById('profile-account-status'),
        googleNotice: document.getElementById('google-account-notice'),
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
        if (msg.includes('provider is not enabled') || msg.includes('unsupported provider')) {
            return 'Google 第三方登入服務尚未在伺服端啟用，請檢查 Supabase 設定。';
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

    // ================= 5. Google 第三方 OAuth 快速登入 =================
    if (elements.btnGoogleAuth) {
        elements.btnGoogleAuth.addEventListener('click', async () => {
            const statusText = elements.statusText;
            statusText.style.color = 'var(--text-muted)';
            statusText.textContent = '正在啟動 Google 授權...';
            elements.btnGoogleAuth.disabled = true;

            try {
                // 安全防呆：Google OAuth 不允許直接以 file:/// 協議進行回呼轉向
                if (window.location.protocol === 'file:') {
                    statusText.style.color = 'var(--danger)';
                    statusText.textContent = '⚠️ Google 登入需在 HTTP/HTTPS 環境下執行 (請使用 VS Code Live Server 或 http://localhost...)';
                    elements.btnGoogleAuth.disabled = false;
                    return;
                }

                // 設定回調跳轉網址
                const redirectTo = window.location.origin + window.location.pathname;

                const { data, error } = await dbClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectTo,
                        queryParams: {
                            access_type: 'offline',
                            prompt: 'consent'
                        }
                    }
                });

                if (error) {
                    statusText.style.color = 'var(--danger)';
                    statusText.textContent = translateAuthError(error.message);
                    elements.btnGoogleAuth.disabled = false;
                }
            } catch (err) {
                console.error('[AuthModule] Google 登入呼叫異常:', err);
                statusText.style.color = 'var(--danger)';
                statusText.textContent = 'Google 登入連線失敗，請稍後再試。';
                elements.btnGoogleAuth.disabled = false;
            }
        });
    }

    // ================= 6. 自訂遊戲帳密認證送出處理 =================
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

    // ================= 7. 登出與強制存檔 =================
    elements.btnSignout.addEventListener('click', async () => {
        elements.btnSignout.disabled = true;
        try {
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

    // ================= 8. 變更密碼功能 =================
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

    // ================= 9. 登入狀態監聽與 UI 同步 =================
    dbClient.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            const meta = session.user.user_metadata || {};
            // 優先取得使用者顯示名稱 (支援 Google full_name、name 或自訂暱稱)
            const displayName = meta.display_name 
                || meta.full_name 
                || meta.name 
                || (session.user.email ? session.user.email.split('@')[0] : '冒險者');
            
            // 判斷是否為 Google 第三方帳號
            const authProvider = session.user.app_metadata?.provider || '';
            const isGoogleUser = authProvider === 'google' || session.user.identities?.some(id => id.provider === 'google');
            const avatarUrl = meta.avatar_url || meta.picture || null;

            elements.playerLabel.textContent = `玩家：${displayName}`;
            elements.btnSettings.classList.remove('hidden');
            elements.btnManualSave.classList.remove('hidden');
            elements.profileDisplayName.textContent = displayName;

            if (elements.profileAccountStatus) {
                elements.profileAccountStatus.textContent = isGoogleUser ? 'Google 認證帳號 🌐' : '自訂遊戲帳號 🎮';
            }

            // 若為 Google 登入用戶，隱藏密碼變更表單並顯示免密碼提示
            if (elements.googleNotice && elements.passwordForm) {
                if (isGoogleUser) {
                    elements.googleNotice.classList.remove('hidden');
                    elements.passwordForm.classList.add('hidden');
                } else {
                    elements.googleNotice.classList.add('hidden');
                    elements.passwordForm.classList.remove('hidden');
                }
            }

            // 若 Google 帳號包含使用者頭像，自動換裝
            if (avatarUrl && window.GameApp.game && window.GameApp.game.setAvatarImage) {
                window.GameApp.game.setAvatarImage(avatarUrl);
            }

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
            elements.playerLabel.textContent = '遊客（未綁定）';
            elements.btnSettings.classList.add('hidden');
            elements.btnManualSave.classList.add('hidden');

            // 登出時重設角色頭像為預設
            if (window.GameApp.game && window.GameApp.game.resetAvatarImage) {
                window.GameApp.game.resetAvatarImage();
            }

            if (elements.googleNotice && elements.passwordForm) {
                elements.googleNotice.classList.add('hidden');
                elements.passwordForm.classList.remove('hidden');
            }

            elements.btnOpenAuth.classList.remove('hidden');
            elements.btnSignout.classList.add('hidden');
            toggleModal(elements.settingsModal, false);

            if (window.GameApp.save && window.GameApp.save.clearPlayerSync) {
                window.GameApp.save.clearPlayerSync();
            } else if (window.clearPlayerSync) {
                window.clearPlayerSync();
            }
        }
    });

    // ================= 10. 導出模組介面 =================
    const authModule = {
        client: dbClient,
        toggleModal,
        encodeAccountToEmail,
        translateAuthError
    };

    window.GameApp.auth = authModule;
    window.dbClient = dbClient;
})();
