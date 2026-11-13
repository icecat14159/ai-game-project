// ================= 初始化雲端連線 =================
const PROJECT_URL = 'https://obgktxdxkcgudbjrdjsj.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_hkbTESoRDihGzXuf_6fn8w_KR6QMKzm';
const dbClient = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);

// 元素抓取
const authModal = document.getElementById('auth-modal');
const profileModal = document.getElementById('profile-modal');
const btnOpenAuth = document.getElementById('btn-open-auth');
const btnCloseAuth = document.getElementById('btn-close-auth');
const btnCloseProfile = document.getElementById('btn-close-profile');
const btnSignout = document.getElementById('btn-signout');
const btnPlayerProfile = document.getElementById('btn-player-profile');
const playerLabel = document.getElementById('player-label');

window.isModalOpen = false; 

// ================= 全字元帳號轉換工具 =================
// 藉由 Hex 轉碼，讓「中文」可以安全地變成類似 e78e8be5a4a7@game.local 的格式
function encodeAccountToEmail(account) {
    const utf8Bytes = new TextEncoder().encode(account.trim());
    const hex = Array.from(utf8Bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex + '@game.local';
}

// ================= 錯誤訊息在地化翻譯 =================
function translateAuthError(errorMsg) {
    if (errorMsg.includes('already registered') || errorMsg.includes('User already exists')) return '此帳號名稱已被使用，請換一個名稱。';
    if (errorMsg.includes('Invalid login credentials')) return '帳號或密碼輸入錯誤。';
    if (errorMsg.includes('Password should be at least')) return '密碼長度不足 (至少 6 位數)。';
    if (errorMsg.includes('New password should be different from the old password.')) return '新密碼不得與舊密碼相同。';
    return errorMsg; // 其他錯誤回傳原文
}

// ================= 彈出視窗與頁籤控制 =================
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const inputConfirm = document.getElementById('input-pass-confirm');
const btnSubmitAuth = document.getElementById('btn-submit-auth');
let currentMode = 'login'; // 'login' 或 'register'

function setAuthMode(mode) {
    currentMode = mode;
    document.getElementById('status-text').textContent = '';
    if (mode === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        inputConfirm.classList.add('hidden');
        btnSubmitAuth.textContent = '登入';
        btnSubmitAuth.style.backgroundColor = '#0097e6';
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        inputConfirm.classList.remove('hidden');
        btnSubmitAuth.textContent = '註冊並綁定';
        btnSubmitAuth.style.backgroundColor = '#44bd32';
    }
}

tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));

function toggleModal(modalElem, show) {
    if (show) {
        modalElem.classList.remove('hidden');
        window.isModalOpen = true;
        if (window.avatar) { window.avatar.velX = 0; window.avatar.velY = 0; }
    } else {
        modalElem.classList.add('hidden');
        window.isModalOpen = false;
    }
}

btnOpenAuth.addEventListener('click', () => toggleModal(authModal, true));
btnCloseAuth.addEventListener('click', () => toggleModal(authModal, false));
btnPlayerProfile.addEventListener('click', () => toggleModal(profileModal, true));
btnCloseProfile.addEventListener('click', () => {
    toggleModal(profileModal, false);
    document.getElementById('profile-status-text').textContent = ''; // 清除密碼變更訊息
});

// ================= 註冊與登入送出邏輯 =================
btnSubmitAuth.addEventListener('click', async () => {
    const rawAccount = document.getElementById('input-account').value.trim();
    const pass = document.getElementById('input-pass').value;
    const confirmPass = inputConfirm.value;
    const statusText = document.getElementById('status-text');

    if (!rawAccount) return statusText.textContent = '請輸入帳號';
    if (!pass) return statusText.textContent = '請輸入密碼';

    statusText.style.color = '#718093';

    if (currentMode === 'register') {
        // 註冊模式：防呆檢查
        if (pass !== confirmPass) {
            statusText.style.color = '#e84118';
            return statusText.textContent = '兩次輸入的密碼不一致！';
        }
        statusText.textContent = '註冊中...';
        
        const { error } = await dbClient.auth.signUp({
            email: encodeAccountToEmail(rawAccount),
            password: pass,
            // 將玩家輸入的真實文字(包含中文)存入 user_metadata 方便未來讀取顯示
            options: { data: { display_name: rawAccount } }
        });

        if (error) {
            statusText.style.color = '#e84118';
            statusText.textContent = translateAuthError(error.message);
        }
    } else {
        // 登入模式
        statusText.textContent = '登入驗證中...';
        const { error } = await dbClient.auth.signInWithPassword({
            email: encodeAccountToEmail(rawAccount),
            password: pass
        });

        if (error) {
            statusText.style.color = '#e84118';
            statusText.textContent = translateAuthError(error.message);
        }
    }
});

btnSignout.addEventListener('click', async () => {
    // 登出前，先抓取當前登入者 ID 並執行最後一次存檔
    const { data: { session } } = await dbClient.auth.getSession();
    if (session) {
        await savePlayerPosition(session.user.id);
    }
    await dbClient.auth.signOut();
});

// ================= 變更密碼邏輯 =================
document.getElementById('btn-change-pass').addEventListener('click', async () => {
    const oldPass = document.getElementById('input-old-pass').value;
    const newPass = document.getElementById('input-new-pass').value;
    const newPassConfirm = document.getElementById('input-new-pass-confirm').value;
    const pStatus = document.getElementById('profile-status-text');
    pStatus.style.color = '#e84118';

    if (!oldPass || !newPass) return pStatus.textContent = '請填寫完整密碼欄位';
    if (newPass !== newPassConfirm) return pStatus.textContent = '新密碼兩次輸入不一致！';

    pStatus.style.color = '#718093';
    pStatus.textContent = '驗證當前密碼中...';

    // 1. 為了安全，重新驗證舊密碼是否正確
    const { data: { session } } = await dbClient.auth.getSession();
    const { error: verifyError } = await dbClient.auth.signInWithPassword({
        email: session.user.email,
        password: oldPass
    });

    if (verifyError) {
        pStatus.style.color = '#e84118';
        return pStatus.textContent = '當前密碼錯誤，請重新確認！';
    }

    // 2. 舊密碼驗證通過，執行更新密碼
    pStatus.textContent = '更新密碼中...';
    const { error: updateError } = await dbClient.auth.updateUser({ password: newPass });

    if (updateError) {
        pStatus.style.color = '#e84118';
        pStatus.textContent = translateAuthError(updateError.message);
    } else {
        pStatus.style.color = '#44bd32';
        pStatus.textContent = '密碼修改成功！';
        // 清空輸入框
        document.getElementById('input-old-pass').value = '';
        document.getElementById('input-new-pass').value = '';
        document.getElementById('input-new-pass-confirm').value = '';
    }
});

// ================= 玩家資料存檔機制 =================
let autoSaveTimer = null;
async function savePlayerPosition(userId) {
    if (!window.avatar) return;
    
    // 使用 upsert：如果資料庫沒有紀錄就新增，有紀錄就覆蓋更新
    await dbClient.from('player_data').upsert({
        id: userId,
        pos_x: window.avatar.x,
        pos_y: window.avatar.y,
        updated_at: new Date().toISOString()
    });
}

// ================= 登入狀態監聽與座標讀取 =================
dbClient.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
        const displayName = session.user.user_metadata?.display_name || '玩家';
        
        playerLabel.textContent = `玩家：${displayName}`;
        btnPlayerProfile.classList.remove('hidden');
        document.getElementById('profile-display-name').textContent = displayName;
        
        btnOpenAuth.classList.add('hidden');
        btnSignout.classList.remove('hidden');
        toggleModal(authModal, false);

        // [新增] 1. 從資料庫讀取座標
        const { data } = await dbClient.from('player_data')
            .select('pos_x, pos_y')
            .eq('id', session.user.id)
            .single();

        // 若有找到紀錄，則更新小人座標 (若無紀錄則保持在預設中心點)
        if (data && window.avatar) {
            window.avatar.x = data.pos_x;
            window.avatar.y = data.pos_y;
        }

        // [新增] 2. 啟動自動存檔 (每 5 秒存一次)
        if (autoSaveTimer) clearInterval(autoSaveTimer);
        autoSaveTimer = setInterval(() => {
            savePlayerPosition(session.user.id);
        }, 5000);

    } else {
        playerLabel.textContent = '目前狀態：遊客（未綁定）';
        btnPlayerProfile.classList.add('hidden');
        
        btnOpenAuth.classList.remove('hidden');
        btnSignout.classList.add('hidden');
        toggleModal(profileModal, false);

        // [新增] 3. 登出時停止自動存檔，並將座標重置回畫面正中央 (遊客預設位置)
        if (autoSaveTimer) {
            clearInterval(autoSaveTimer);
            autoSaveTimer = null;
        }
        if (window.avatar) {
            const stage = document.getElementById('stage');
            window.avatar.x = stage.width / 2;
            window.avatar.y = stage.height / 2;
        }
    }
});