// Конфигурация API
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://YOUR_RENDER_URL.onrender.com'; // Замените на ваш URL с Render

const socket = io(API_URL);

let userData = {};
let shopItems = [];
let inventory = [];
let achievements = [];

// Элементы DOM
const authDiv = document.getElementById('auth');
const gameDiv = document.getElementById('game');
const loginForm = document.getElementById('loginForm');
const registerBtn = document.getElementById('registerBtn');
const authError = document.getElementById('authError');
const logoutBtn = document.getElementById('logoutBtn');
const displayUsername = document.getElementById('displayUsername');
const crystalsSpan = document.getElementById('crystals');
const influenceSpan = document.getElementById('influence');
const levelSpan = document.getElementById('level');
const expSpan = document.getElementById('exp');
const healthSpan = document.getElementById('health');
const maxHealthSpan = document.getElementById('maxHealth');
const energySpan = document.getElementById('energy');
const maxEnergySpan = document.getElementById('maxEnergy');
const attackSpan = document.getElementById('attack');
const defenseSpan = document.getElementById('defense');
const critSpan = document.getElementById('crit');
const dodgeSpan = document.getElementById('dodge');
const prestigeSpan = document.getElementById('prestige');
const autoRobotsSpan = document.getElementById('autoRobots');
const autoMinesSpan = document.getElementById('autoMines');
const autoFarmsSpan = document.getElementById('autoFarms');
const clickBtn = document.getElementById('clickBtn');
const toUsernameInput = document.getElementById('toUsername');
const amountInput = document.getElementById('amount');
const transferBtn = document.getElementById('transferBtn');
const transferMessage = document.getElementById('transferMessage');
const dailyBonusBtn = document.getElementById('dailyBonusBtn');
const bonusMessage = document.getElementById('bonusMessage');
const battleLog = document.getElementById('battleLog');
const battleEnergy = document.getElementById('battleEnergy');
const prestigeBtn = document.getElementById('prestigeBtn');
const crystalLeaderboard = document.getElementById('crystalLeaderboard');
const influenceLeaderboard = document.getElementById('influenceLeaderboard');
const shopItemsDiv = document.getElementById('shopItems');
const inventoryDiv = document.getElementById('inventory');
const achievementsList = document.getElementById('achievementsList');
const clanInfo = document.getElementById('clanInfo');
const clanActions = document.getElementById('clanActions');

// Элементы для боя (новые)
const botStatsDiv = document.getElementById('botStats');
const playerVsBotDiv = document.getElementById('playerVsBot');
const battleResultDiv = document.getElementById('battleResult');
const botHealthBar = document.getElementById('botHealthBar');
const botHealthText = document.getElementById('botHealthText');

// Элементы улучшений
const attackCostSpan = document.getElementById('attackCost');
const defenseCostSpan = document.getElementById('defenseCost');
const critCostSpan = document.getElementById('critCost');
const dodgeCostSpan = document.getElementById('dodgeCost');
const healthCostSpan = document.getElementById('healthCost');
const attackValSpan = document.getElementById('attackVal');
const defenseValSpan = document.getElementById('defenseVal');
const critValSpan = document.getElementById('critVal');
const dodgeValSpan = document.getElementById('dodgeVal');
const healthValSpan = document.getElementById('healthVal');
const prestigeValSpan = document.getElementById('prestigeVal');

// Прогресс заданий
const daily1Progress = document.getElementById('daily1Progress');
const daily2Progress = document.getElementById('daily2Progress');
const daily3Progress = document.getElementById('daily3Progress');

// ========== Утилиты ==========

function updateUI() {
    if (!userData) return;
    displayUsername.textContent = userData.username;
    crystalsSpan.textContent = userData.crystals;
    influenceSpan.textContent = userData.influence;
    levelSpan.textContent = userData.level;
    expSpan.textContent = userData.exp;
    healthSpan.textContent = userData.health;
    maxHealthSpan.textContent = userData.maxHealth;
    energySpan.textContent = userData.energy;
    maxEnergySpan.textContent = userData.maxEnergy;
    attackSpan.textContent = userData.attack;
    defenseSpan.textContent = userData.defense;
    critSpan.textContent = userData.crit;
    dodgeSpan.textContent = userData.dodge;
    prestigeSpan.textContent = userData.prestige;
    autoRobotsSpan.textContent = userData.autoRobots;
    autoMinesSpan.textContent = userData.autoMines;
    autoFarmsSpan.textContent = userData.autoFarms;

    attackValSpan.textContent = userData.attack;
    defenseValSpan.textContent = userData.defense;
    critValSpan.textContent = userData.crit;
    dodgeValSpan.textContent = userData.dodge;
    healthValSpan.textContent = userData.maxHealth;
    prestigeValSpan.textContent = userData.prestige;

    attackCostSpan.textContent = Math.floor(300 * (1 + userData.attack * 0.1));
    defenseCostSpan.textContent = Math.floor(200 * (1 + userData.defense * 0.1));
    critCostSpan.textContent = Math.floor(400 * (1 + userData.crit * 0.1));
    dodgeCostSpan.textContent = Math.floor(400 * (1 + userData.dodge * 0.1));
    healthCostSpan.textContent = Math.floor(500 * (1 + (userData.maxHealth / 20 - 5) * 0.1));

    battleEnergy.textContent = userData.energy;

    if (userData.questProgress) {
        try {
            const quest = JSON.parse(userData.questProgress);
            daily1Progress.textContent = `${quest.click || 0}/500`;
            daily2Progress.textContent = `${quest.pvp || 0}/3`;
            daily3Progress.textContent = `${quest.spend || 0}/1000`;
        } catch (e) {}
    }
}

async function loadUser() {
    const res = await fetch(`${API_URL}/api/user`, { credentials: 'include' });
    if (res.ok) {
        userData = await res.json();
        updateUI();
        return true;
    }
    return false;
}

function updateLeaderboardTables(data) {
    if (!data) return;
    crystalLeaderboard.innerHTML = data.crystalTop.map((u, i) => `
        <tr>
            <td>${i+1}</td>
            <td>${u.username}</td>
            <td>${u.crystals}</td>
            <td>${u.level}</td>
            <td>${u.prestige || 0}</td>
            <td>${u.clanName || '-'}</td>
        </tr>
    `).join('');
    influenceLeaderboard.innerHTML = data.influenceTop.map((u, i) => `
        <tr>
            <td>${i+1}</td>
            <td>${u.username}</td>
            <td>${u.influence}</td>
            <td>${u.level}</td>
            <td>${u.prestige || 0}</td>
            <td>${u.clanName || '-'}</td>
        </tr>
    `).join('');
}

async function loadLeaderboard() {
    const res = await fetch(`${API_URL}/api/leaderboard`);
    if (res.ok) {
        const data = await res.json();
        updateLeaderboardTables(data);
    }
}

async function loadShop() {
    const res = await fetch(`${API_URL}/api/items`);
    if (res.ok) {
        shopItems = await res.json();
        renderShop();
    }
}

function renderShop() {
    if (!shopItemsDiv) return;
    shopItemsDiv.innerHTML = shopItems.map(item => `
        <div class="list-group-item bg-dark text-light border-info d-flex justify-content-between align-items-center">
            <div>
                <strong>${item.name}</strong><br>
                <small>${item.description}</small>
            </div>
            <div>
                <span class="badge bg-info me-2">${item.cost} крист.</span>
                <button class="btn btn-sm btn-neon-success buy-item" data-item-id="${item.id}">Купить</button>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.buy-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const itemId = e.target.dataset.itemId;
            const res = await fetch(`${API_URL}/api/buyItem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId }),
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                userData.crystals = data.crystals;
                updateUI();
                loadInventory();
            } else {
                const err = await res.json();
                alert(err.error || 'Ошибка покупки');
            }
        });
    });
}

async function loadInventory() {
    const res = await fetch(`${API_URL}/api/inventory`, { credentials: 'include' });
    if (res.ok) {
        inventory = await res.json();
        renderInventory();
    }
}

function renderInventory() {
    if (!inventoryDiv) return;
    inventoryDiv.innerHTML = inventory.map(item => `
        <div class="list-group-item bg-dark text-light border-info d-flex justify-content-between">
            <span>${item.name} x${item.quantity}</span>
            <button class="btn btn-sm btn-neon-primary use-item" data-item-id="${item.id}">Использовать</button>
        </div>
    `).join('');

    document.querySelectorAll('.use-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const itemId = e.target.dataset.itemId;
            const res = await fetch(`${API_URL}/api/useItem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId }),
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    userData.health = data.health;
                    userData.maxHealth = data.maxHealth;
                    updateUI();
                    loadInventory(); // обновить инвентарь
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Ошибка использования');
            }
        });
    });
}

async function loadAchievements() {
    const res = await fetch(`${API_URL}/api/achievements`);
    if (res.ok) {
        achievements = await res.json();
        renderAchievements();
    }
}

function renderAchievements() {
    if (!achievementsList) return;
    const userAchievements = userData.achievements ? JSON.parse(userData.achievements) : [];
    achievementsList.innerHTML = achievements.map(ach => {
        const completed = userAchievements.includes(String(ach.id));
        return `
            <div class="list-group-item bg-dark text-light border-info ${completed ? 'opacity-50' : ''}">
                <i class="fas ${completed ? 'fa-check-circle text-success' : 'fa-lock text-secondary'} me-2"></i>
                ${ach.name} — ${ach.description}
                ${completed ? ' <span class="badge bg-success">Выполнено</span>' : ''}
            </div>
        `;
    }).join('');
}

// ========== Сохранение активной вкладки ==========
function saveActiveTab() {
    const activeTab = document.querySelector('#gameTabs .nav-link.active');
    if (activeTab) {
        const target = activeTab.getAttribute('data-bs-target') || activeTab.getAttribute('href');
        if (target) {
            localStorage.setItem('activeTab', target);
        }
    }
}

function restoreActiveTab() {
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
        const tabButton = document.querySelector(`#gameTabs .nav-link[data-bs-target="${savedTab}"], #gameTabs .nav-link[href="${savedTab}"]`);
        if (tabButton) {
            const tab = new bootstrap.Tab(tabButton);
            tab.show();
        }
    }
}

// ========== Переключение экранов ==========
async function showGame() {
    authDiv.style.display = 'none';
    gameDiv.style.display = 'block';
    await loadUser();
    loadLeaderboard();
    loadShop();
    loadInventory();
    loadAchievements();
    socket.disconnect();
    socket.connect();
    setTimeout(restoreActiveTab, 100);
}

function showAuth() {
    authDiv.style.display = 'block';
    gameDiv.style.display = 'none';
    userData = {};
    socket.disconnect();
    socket.connect();
}

// ========== Обработчики авторизации ==========
registerBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        if (data.success) {
            await showGame();
        }
    } else {
        const text = await res.text();
        authError.textContent = text;
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        if (data.success) {
            await showGame();
        }
    } else {
        const text = await res.text();
        authError.textContent = text;
    }
});

logoutBtn.addEventListener('click', async () => {
    const res = await fetch('/logout', {
        method: 'POST',
        credentials: 'include'
    });
    if (res.ok) {
        showAuth();
    }
});

// ========== Игровые действия ==========
clickBtn.addEventListener('click', async () => {
    const res = await fetch(`${API_URL}/api/click`, {
        method: 'POST',
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        userData.crystals = data.crystals;
        userData.totalClicks = data.totalClicks;
        if (data.questProgress) userData.questProgress = data.questProgress;
        updateUI();
    } else {
        alert('Ошибка клика');
    }
});

transferBtn.addEventListener('click', async () => {
    const toUsername = toUsernameInput.value;
    const amount = amountInput.value;
    if (!toUsername || !amount) {
        transferMessage.textContent = 'Заполните все поля';
        return;
    }
    const res = await fetch(`${API_URL}/api/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUsername, amount }),
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        userData.crystals = data.crystals;
        updateUI();
        transferMessage.textContent = 'Перевод выполнен!';
        toUsernameInput.value = '';
        amountInput.value = '';
    } else {
        const err = await res.json();
        transferMessage.textContent = err.error || 'Ошибка перевода';
    }
});

// Улучшенный PvP
document.querySelectorAll('.pvp-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const botType = e.target.dataset.bot;
        const res = await fetch(`${API_URL}/api/pvp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botType }),
            credentials: 'include'
        });
        if (res.ok) {
            const data = await res.json();
            // Отображение лога
            battleLog.innerHTML = data.log.map(line => `<p class="mb-1">${line}</p>`).join('');

            // Отображение статистики боя
            const player = data.playerStats;
            const bot = data.botStats;
            const playerVsBotDiv = document.getElementById('playerVsBot');
            playerVsBotDiv.innerHTML = `
                <div class="row small">
                    <div class="col-6">Ваши статы: Атака ${player.attack}, Защита ${player.defense}, Крит ${player.crit}%, Уклон ${player.dodge}%</div>
                    <div class="col-6">Статы бота (${data.botName}): Атака ${bot.attack}, Защита ${bot.defense}, Крит ${bot.crit}%, Уклон ${bot.dodge}%</div>
                </div>
            `;

            // Полоска HP бота
            const percent = Math.max(0, (data.botHp / data.maxBotHp) * 100);
            botHealthBar.style.width = percent + '%';
            botHealthBar.setAttribute('aria-valuenow', percent);
            botHealthBar.textContent = `${data.botHp}/${data.maxBotHp}`;
            botHealthText.textContent = `HP ${data.botName}: ${data.botHp}/${data.maxBotHp}`;

            // Результат
            const resultDiv = document.getElementById('battleResult');
            resultDiv.innerHTML = data.result === 'win' ? '<span class="text-success">Победа!</span>' : '<span class="text-danger">Поражение...</span>';

            Object.assign(userData, data);
            updateUI();
        } else {
            const err = await res.json();
            alert(err.error || 'Ошибка боя');
        }
    });
});

document.querySelectorAll('.buy-auto').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const type = e.target.dataset.type;
        const res = await fetch(`${API_URL}/api/buyAuto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
            credentials: 'include'
        });
        if (res.ok) {
            const data = await res.json();
            userData.crystals = data.crystals;
            if (type === 'robot') userData.autoRobots = data.autoRobots;
            if (type === 'mine') userData.autoMines = data.autoMines;
            if (type === 'farm') userData.autoFarms = data.autoFarms;
            updateUI();
        } else {
            const err = await res.json();
            alert(err.error || 'Ошибка покупки');
        }
    });
});

document.querySelectorAll('.buy-upgrade').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const stat = e.target.dataset.stat;
        const res = await fetch(`${API_URL}/api/buyUpgrade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stat }),
            credentials: 'include'
        });
        if (res.ok) {
            const data = await res.json();
            userData.crystals = data.crystals;
            userData[stat] = data[stat];
            if (stat === 'health') userData.maxHealth = data.maxHealth;
            updateUI();
        } else {
            const err = await res.json();
            alert(err.error || 'Ошибка улучшения');
        }
    });
});

prestigeBtn.addEventListener('click', async () => {
    const res = await fetch(`${API_URL}/api/prestige`, {
        method: 'POST',
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        userData.prestige = data.prestige;
        userData.level = data.level;
        userData.crystals = data.crystals;
        updateUI();
    } else {
        const err = await res.json();
        alert(err.error || 'Ошибка престижа');
    }
});

dailyBonusBtn.addEventListener('click', async () => {
    const res = await fetch(`${API_URL}/api/dailyBonus`, {
        method: 'POST',
        credentials: 'include'
    });
    if (res.ok) {
        const data = await res.json();
        userData.crystals = data.crystals;
        updateUI();
        bonusMessage.textContent = 'Бонус получен!';
    } else {
        const err = await res.json();
        bonusMessage.textContent = err.error || 'Ошибка';
    }
});

// ========== Socket.io ==========
socket.on('balance_update', (data) => {
    userData.crystals = data.crystals;
    updateUI();
});

socket.on('transfer_received', (data) => {
    alert(`Вы получили ${data.amount} кристаллов!`);
    loadUser();
});

socket.on('auto_income', (data) => {
    userData.crystals += data.amount;
    updateUI();
});

socket.on('achievement_unlocked', (data) => {
    alert('Получено новое достижение!');
    loadUser();
});

socket.on('leaderboard_update', (data) => {
    updateLeaderboardTables(data);
});

// ========== Инициализация ==========
(async function init() {
    document.addEventListener('shown.bs.tab', function (event) {
        if (event.target.closest('#gameTabs')) {
            saveActiveTab();
        }
    });

    const isAuth = await loadUser();
    if (isAuth) {
        await showGame();
    } else {
        showAuth();
    }

    setInterval(loadLeaderboard, 60000);
})();