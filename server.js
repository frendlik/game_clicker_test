const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Сессии
const sessionMiddleware = session({
  secret: 'neon-clicker-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Подключаем Socket.io к сессиям
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// База данных
const db = new sqlite3.Database('./db.sqlite');
db.serialize(() => {
  // Таблица пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      crystals INTEGER DEFAULT 200,
      influence INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      health INTEGER DEFAULT 100,
      maxHealth INTEGER DEFAULT 100,
      attack INTEGER DEFAULT 15,
      defense INTEGER DEFAULT 10,
      crit INTEGER DEFAULT 5,
      dodge INTEGER DEFAULT 5,
      energy INTEGER DEFAULT 5,
      maxEnergy INTEGER DEFAULT 5,
      prestige INTEGER DEFAULT 0,
      totalClicks INTEGER DEFAULT 0,
      autoRobots INTEGER DEFAULT 0,
      autoMines INTEGER DEFAULT 0,
      autoFarms INTEGER DEFAULT 0,
      lastBonus TEXT,
      lastEnergyTime TEXT DEFAULT CURRENT_TIMESTAMP,
      lastHealthTime TEXT DEFAULT CURRENT_TIMESTAMP,
      questProgress TEXT DEFAULT '{"click":0,"pvp":0,"spend":0,"daily":[]}',
      questClaimed TEXT DEFAULT '{}',
      achievements TEXT DEFAULT '[]',
      clanId INTEGER DEFAULT NULL,
      FOREIGN KEY (clanId) REFERENCES clans(id)
    )
  `);

  // Таблица предметов
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      type TEXT,
      effect TEXT,
      cost INTEGER
    )
  `);

  // Таблица инвентаря (без уникального constraint, используем логику)
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      itemId INTEGER,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (itemId) REFERENCES items(id)
    )
  `);

  // Таблица кланов
  db.run(`
    CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      leaderId INTEGER,
      bank INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      FOREIGN KEY (leaderId) REFERENCES users(id)
    )
  `);

  // Таблица участников клана
  db.run(`
    CREATE TABLE IF NOT EXISTS clan_members (
      userId INTEGER PRIMARY KEY,
      clanId INTEGER,
      role TEXT DEFAULT 'member',
      joined TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (clanId) REFERENCES clans(id)
    )
  `);

  // Таблица достижений
  db.run(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      condition TEXT,
      reward TEXT
    )
  `);

  // Заполним таблицу предметов
  db.get("SELECT COUNT(*) as cnt FROM items", (err, row) => {
    if (row.cnt === 0) {
      db.run(`
        INSERT INTO items (name, description, type, effect, cost) VALUES
        ('Малое зелье здоровья', '+30 HP', 'potion', 'heal:30', 500),
        ('Свиток ярости', '+10% крита на 1 бой', 'scroll', 'crit+10', 800),
        ('Бомба', 'Наносит 50 урона противнику', 'bomb', 'damage:50', 1200),
        ('Талисман удачи', '+5% уклонения на 1 бой', 'talisman', 'dodge+5', 700)
      `);
    }
  });

  // Заполним достижения
  db.get("SELECT COUNT(*) as cnt FROM achievements", (err, row) => {
    if (row.cnt === 0) {
      db.run(`
        INSERT INTO achievements (name, description, condition, reward) VALUES
        ('Первые шаги', 'Накликать 1000 кристаллов', 'totalClicks>=1000', 'crystals:2000,influence:20'),
        ('Воин', 'Выиграть 50 боёв', 'pvpWins>=50', 'crystals:5000,influence:50'),
        ('Магнат', 'Накопить 10000 кристаллов', 'crystals>=100000', 'crystals:10000,influence:100'),
        ('Лидер', 'Создать клан', 'clanLeader', 'crystals:3000,influence:30')
      `);
    }
  });
});

// Вспомогательные функции
function getUserById(id, callback) {
  db.get('SELECT * FROM users WHERE id = ?', [id], callback);
}

// Функция получения топа для рейтинга
function getLeaderboard(callback) {
  db.all(`
    SELECT u.username, u.crystals, u.influence, u.level, u.prestige, c.name as clanName
    FROM users u
    LEFT JOIN clans c ON u.clanId = c.id
    ORDER BY u.crystals DESC LIMIT 10`, (err, crystalTop) => {
      if (err) return callback(err);
      db.all(`
        SELECT u.username, u.influence, u.level, u.prestige, c.name as clanName
        FROM users u
        LEFT JOIN clans c ON u.clanId = c.id
        ORDER BY u.influence DESC LIMIT 10`, (err, influenceTop) => {
          callback(null, { crystalTop, influenceTop });
    });
  });
}

// Рассылка рейтинга
function broadcastLeaderboard() {
  getLeaderboard((err, data) => {
    if (!err) {
      io.emit('leaderboard_update', data);
    }
  });
}

// Проверка достижений (упрощённо)
function checkAchievements(userId) {
  getUserById(userId, (err, user) => {
    if (err || !user) return;
    let achievements = [];
    try { achievements = JSON.parse(user.achievements || '[]'); } catch { achievements = []; }
    const newAchievements = [];

    if (user.totalClicks >= 1000 && !achievements.includes('1')) {
      newAchievements.push('1');
      db.run('UPDATE users SET crystals = crystals + 2000, influence = influence + 20 WHERE id = ?', [userId]);
    }
    // Остальные условия можно добавить позже

    if (newAchievements.length > 0) {
      achievements = [...achievements, ...newAchievements];
      db.run('UPDATE users SET achievements = ? WHERE id = ?', [JSON.stringify(achievements), userId]);
      io.to(`user-${userId}`).emit('achievement_unlocked', { ids: newAchievements });
    }
  });
}

// ========== АВТОРИЗАЦИЯ ==========
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Имя и пароль обязательны');
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).send('Имя уже занято');
      return res.status(500).send('Ошибка базы данных');
    }
    req.session.userId = this.lastID;
    res.json({ success: true });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) return res.status(400).send('Неверное имя или пароль');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).send('Неверное имя или пароль');
    req.session.userId = user.id;
    res.json({ success: true });
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ========== API ==========
app.get('/api/user', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  getUserById(req.session.userId, (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    const { password, ...userData } = user;
    res.json(userData);
  });
});

app.post('/api/click', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  db.get('SELECT crystals, totalClicks, questProgress FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Ошибка БД' });
    const quest = JSON.parse(user.questProgress || '{"click":0,"pvp":0,"spend":0,"daily":[]}');
    quest.click = (quest.click || 0) + 1;
    db.run('UPDATE users SET crystals = crystals + 1, totalClicks = totalClicks + 1, questProgress = ? WHERE id = ?', [JSON.stringify(quest), req.session.userId], function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      getUserById(req.session.userId, (err, updated) => {
        if (err) return res.status(500).json({ error: 'Ошибка БД' });
        res.json({ crystals: updated.crystals, questProgress: updated.questProgress, totalClicks: updated.totalClicks });
        io.to(`user-${req.session.userId}`).emit('balance_update', { crystals: updated.crystals });
        broadcastLeaderboard();
        checkAchievements(req.session.userId);
      });
    });
  });
});

app.post('/api/transfer', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { toUsername, amount } = req.body;
  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) return res.status(400).json({ error: 'Неверная сумма' });

  db.get('SELECT id, crystals FROM users WHERE id = ?', [req.session.userId], (err, sender) => {
    if (err || !sender) return res.status(404).json({ error: 'Отправитель не найден' });
    if (sender.crystals < amountInt) return res.status(400).json({ error: 'Недостаточно кристаллов' });

    db.get('SELECT id FROM users WHERE username = ?', [toUsername], (err, recipient) => {
      if (err || !recipient) return res.status(404).json({ error: 'Получатель не найден' });

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('UPDATE users SET crystals = crystals - ? WHERE id = ?', [amountInt, sender.id]);
        db.run('UPDATE users SET crystals = crystals + ? WHERE id = ?', [amountInt, recipient.id]);
        db.run('COMMIT', (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Ошибка транзакции' });
          }
          getUserById(sender.id, (err, updatedSender) => {
            if (err) return res.status(500).json({ error: 'Ошибка БД' });
            res.json({ crystals: updatedSender.crystals });
            io.to(`user-${recipient.id}`).emit('transfer_received', { amount: amountInt, from: sender.id });
            broadcastLeaderboard();
          });
        });
      });
    });
  });
});

// Улучшенная PvP система с отображением HP бота и сравнением
app.post('/api/pvp', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { botType } = req.body;

  getUserById(req.session.userId, (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.energy < 1) return res.status(400).json({ error: 'Недостаточно энергии' });

    // Генерация бота
    let bot;
    const baseLevel = user.level;
    switch (botType) {
      case 'tank':
        bot = { name: 'Танк', hp: 300 + baseLevel * 30, attack: 10 + baseLevel, defense: 30 + baseLevel * 3, crit: 3, dodge: 2 };
        break;
      case 'rogue':
        bot = { name: 'Ловкач', hp: 150 + baseLevel * 15, attack: 20 + baseLevel * 3, defense: 8 + baseLevel, crit: 20, dodge: 20 };
        break;
      case 'boss':
        bot = { name: 'Элитный босс', hp: 800 + baseLevel * 80, attack: 30 + baseLevel * 4, defense: 25 + baseLevel * 3, crit: 15, dodge: 15 };
        break;
      default:
        bot = { name: 'Обычный бот', hp: 150 + baseLevel * 15, attack: 15 + baseLevel * 2, defense: 12 + baseLevel, crit: 8, dodge: 8 };
    }

    // Сохраняем максимальное HP для отображения
    const maxBotHp = bot.hp;
    let playerHP = user.health;
    let botHP = bot.hp;
    let log = [];

    // Функция расчёта урона
    function calculateDamage(attackerAttack, attackerCrit, defenderDefense, defenderDodge) {
      if (Math.random() * 100 < defenderDodge) return { damage: 0, crit: false, dodge: true };
      let damage = Math.max(1, attackerAttack - Math.floor(defenderDefense / 2) + Math.floor(Math.random() * 5));
      let isCrit = false;
      if (Math.random() * 100 < attackerCrit) {
        damage *= 2;
        isCrit = true;
      }
      return { damage: Math.floor(damage), crit: isCrit, dodge: false };
    }

    // Бой до 20 раундов
    for (let round = 1; round <= 20; round++) {
      // Игрок атакует
      const playerAttack = calculateDamage(user.attack, user.crit, bot.defense, bot.dodge);
      if (playerAttack.dodge) {
        log.push(`⚡ Бот уклонился от вашей атаки!`);
      } else {
        botHP -= playerAttack.damage;
        log.push(`💥 Вы нанесли ${playerAttack.damage} урона${playerAttack.crit ? ' (КРИТ)' : ''}.`);
      }
      if (botHP <= 0) break;

      // Бот атакует
      const botAttack = calculateDamage(bot.attack, bot.crit, user.defense, user.dodge);
      if (botAttack.dodge) {
        log.push(`✨ Вы уклонились от атаки бота!`);
      } else {
        playerHP -= botAttack.damage;
        log.push(`🔥 ${bot.name} нанёс вам ${botAttack.damage} урона${botAttack.crit ? ' (КРИТ)' : ''}.`);
      }
      if (playerHP <= 0) break;
    }

    let result, influenceGain, expGain, crystalsGain;
    if (playerHP > 0 && botHP <= 0) {
      result = 'win';
      influenceGain = 20 * (botType === 'boss' ? 3 : (botType === 'tank' ? 2 : 1));
      expGain = 40 * (botType === 'boss' ? 3 : (botType === 'tank' ? 2 : 1));
      crystalsGain = 100 * (botType === 'boss' ? 4 : (botType === 'tank' ? 2 : 1));
    } else {
      result = 'lose';
      influenceGain = 5;
      expGain = 10;
      crystalsGain = 20;
    }

    // Обновляем статистику
    db.run(`
      UPDATE users SET 
        health = ?,
        energy = energy - 1,
        influence = influence + ?,
        exp = exp + ?,
        crystals = crystals + ?,
        questProgress = json_set(questProgress, '$.pvp', json_extract(questProgress, '$.pvp') + 1)
      WHERE id = ?`,
      [playerHP, influenceGain, expGain, crystalsGain, user.id],
      function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка БД' });

        db.get('SELECT exp, level FROM users WHERE id = ?', [user.id], (err, updated) => {
          if (err) return res.status(500).json({ error: 'Ошибка БД' });
          let newLevel = updated.level;
          let levelUp = false;
          while (updated.exp >= newLevel * 100) {
            newLevel++;
            levelUp = true;
          }
          if (levelUp) {
            db.run('UPDATE users SET level = ?, health = maxHealth, attack = attack + 3, defense = defense + 2, crit = crit + 1, dodge = dodge + 1, maxHealth = maxHealth + 20 WHERE id = ?', [newLevel, user.id]);
          }

          getUserById(user.id, (err, finalUser) => {
            if (err) return res.status(500).json({ error: 'Ошибка БД' });
            res.json({
              result,
              log,
              botName: bot.name,
              botHp: botHP,
              maxBotHp,
              playerHp: playerHP,
              maxPlayerHp: finalUser.maxHealth,
              influence: finalUser.influence,
              exp: finalUser.exp,
              level: finalUser.level,
              health: finalUser.health,
              crystals: finalUser.crystals,
              energy: finalUser.energy,
              // Для сравнения
              playerStats: {
                attack: finalUser.attack,
                defense: finalUser.defense,
                crit: finalUser.crit,
                dodge: finalUser.dodge
              },
              botStats: {
                attack: bot.attack,
                defense: bot.defense,
                crit: bot.crit,
                dodge: bot.dodge
              }
            });
            io.to(`user-${user.id}`).emit('balance_update', { crystals: finalUser.crystals });
            broadcastLeaderboard();
            checkAchievements(user.id);
          });
        });
    });
  });
});

// Покупка автокликеров
app.post('/api/buyAuto', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { type } = req.body;
  let cost, field;
  if (type === 'robot') { cost = 500; field = 'autoRobots'; }
  else if (type === 'mine') { cost = 2000; field = 'autoMines'; }
  else if (type === 'farm') { cost = 5000; field = 'autoFarms'; }
  else return res.status(400).json({ error: 'Неверный тип' });

  db.get(`SELECT crystals, ${field} FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.crystals < cost) return res.status(400).json({ error: 'Недостаточно кристаллов' });

    db.run(`UPDATE users SET crystals = crystals - ?, ${field} = ${field} + 1 WHERE id = ?`, [cost, req.session.userId], function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      getUserById(req.session.userId, (err, updated) => {
        if (err) return res.status(500).json({ error: 'Ошибка БД' });
        res.json({ crystals: updated.crystals, [field]: updated[field] });
        io.to(`user-${req.session.userId}`).emit('balance_update', { crystals: updated.crystals });
        broadcastLeaderboard();
        // Квест на трату
        db.get('SELECT questProgress FROM users WHERE id = ?', [req.session.userId], (err, row) => {
          const quest = JSON.parse(row.questProgress || '{"click":0,"pvp":0,"spend":0,"daily":[]}');
          quest.spend = (quest.spend || 0) + cost;
          db.run('UPDATE users SET questProgress = ? WHERE id = ?', [JSON.stringify(quest), req.session.userId]);
        });
      });
    });
  });
});

// Покупка улучшений
app.post('/api/buyUpgrade', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { stat } = req.body;
  let baseCost, field, increment = 1;
  switch (stat) {
    case 'attack': baseCost = 300; field = 'attack'; break;
    case 'defense': baseCost = 200; field = 'defense'; break;
    case 'crit': baseCost = 400; field = 'crit'; break;
    case 'dodge': baseCost = 400; field = 'dodge'; break;
    case 'health': baseCost = 500; field = 'maxHealth'; increment = 20; break;
    default: return res.status(400).json({ error: 'Неверный тип' });
  }

  db.get(`SELECT crystals, ${field}, level FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    const currentVal = user[field];
    const cost = Math.floor(baseCost * (1 + currentVal * 0.1));
    if (user.crystals < cost) return res.status(400).json({ error: 'Недостаточно кристаллов' });

    db.run(`UPDATE users SET crystals = crystals - ?, ${field} = ${field} + ? WHERE id = ?`, [cost, increment, req.session.userId], function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      getUserById(req.session.userId, (err, updated) => {
        if (err) return res.status(500).json({ error: 'Ошибка БД' });
        res.json({ crystals: updated.crystals, [field]: updated[field] });
        io.to(`user-${req.session.userId}`).emit('balance_update', { crystals: updated.crystals });
        broadcastLeaderboard();
        db.get('SELECT questProgress FROM users WHERE id = ?', [req.session.userId], (err, row) => {
          const quest = JSON.parse(row.questProgress || '{"click":0,"pvp":0,"spend":0,"daily":[]}');
          quest.spend = (quest.spend || 0) + cost;
          db.run('UPDATE users SET questProgress = ? WHERE id = ?', [JSON.stringify(quest), req.session.userId]);
        });
      });
    });
  });
});

// Престиж
app.post('/api/prestige', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  db.get('SELECT level, prestige FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.level < 10) return res.status(400).json({ error: 'Нужен 10 уровень' });

    db.run(`
      UPDATE users SET 
        level = 1,
        exp = 0,
        prestige = prestige + 1,
        attack = 15,
        defense = 10,
        crit = 5,
        dodge = 5,
        health = 100,
        maxHealth = 100,
        crystals = crystals + 5000 * (prestige + 1)
      WHERE id = ?`, [user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка БД' });
        getUserById(user.id, (err, updated) => {
          res.json({ prestige: updated.prestige, level: updated.level, crystals: updated.crystals });
          broadcastLeaderboard();
        });
    });
  });
});

// Ежедневный бонус
app.post('/api/dailyBonus', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const now = new Date().toISOString().split('T')[0];
  db.get('SELECT lastBonus FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.lastBonus === now) return res.status(400).json({ error: 'Бонус уже получен сегодня' });

    db.run('UPDATE users SET crystals = crystals + 2000, lastBonus = ? WHERE id = ?', [now, req.session.userId], function(err) {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      getUserById(req.session.userId, (err, updated) => {
        res.json({ crystals: updated.crystals, lastBonus: updated.lastBonus });
        broadcastLeaderboard();
      });
    });
  });
});

// Использование предмета (зелья здоровья)
app.post('/api/useItem', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { itemId } = req.body;

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // Проверяем наличие предмета
    db.get('SELECT quantity FROM inventory WHERE userId = ? AND itemId = ?', [req.session.userId, itemId], (err, row) => {
      if (err || !row || row.quantity < 1) {
        db.run('ROLLBACK');
        return res.status(400).json({ error: 'У вас нет этого предмета' });
      }

      // Получаем эффект предмета
      db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
        if (err || !item) {
          db.run('ROLLBACK');
          return res.status(404).json({ error: 'Предмет не найден' });
        }

        // Применяем эффект (пока только heal)
        if (item.type === 'potion') {
          const healAmount = parseInt(item.effect.split(':')[1]) || 30;
          db.get('SELECT health, maxHealth FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Ошибка БД' });
            }
            const newHealth = Math.min(user.health + healAmount, user.maxHealth);
            db.run('UPDATE users SET health = ? WHERE id = ?', [newHealth, req.session.userId], (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Ошибка БД' });
              }

              // Уменьшаем количество предмета
              if (row.quantity === 1) {
                db.run('DELETE FROM inventory WHERE userId = ? AND itemId = ?', [req.session.userId, itemId]);
              } else {
                db.run('UPDATE inventory SET quantity = quantity - 1 WHERE userId = ? AND itemId = ?', [req.session.userId, itemId]);
              }

              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Ошибка транзакции' });
                }
                getUserById(req.session.userId, (err, updated) => {
                  res.json({ success: true, health: updated.health, maxHealth: updated.maxHealth });
                });
              });
            });
          });
        } else {
          db.run('ROLLBACK');
          res.status(400).json({ error: 'Этот предмет нельзя использовать сейчас' });
        }
      });
    });
  });
});

// Получение инвентаря
app.get('/api/inventory', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  db.all(`
    SELECT i.*, inv.quantity FROM inventory inv
    JOIN items i ON inv.itemId = i.id
    WHERE inv.userId = ?`, [req.session.userId], (err, items) => {
      if (err) return res.status(500).json({ error: 'Ошибка БД' });
      res.json(items);
  });
});

// Покупка предмета (исправлено)
app.post('/api/buyItem', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { itemId } = req.body;
  db.get('SELECT * FROM items WHERE id = ?', [itemId], (err, item) => {
    if (err || !item) return res.status(404).json({ error: 'Предмет не найден' });
    db.get('SELECT crystals FROM users WHERE id = ?', [req.session.userId], (err, user) => {
      if (user.crystals < item.cost) return res.status(400).json({ error: 'Недостаточно кристаллов' });

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Списание кристаллов
        db.run('UPDATE users SET crystals = crystals - ? WHERE id = ?', [item.cost, req.session.userId]);

        // Проверяем, есть ли уже такой предмет в инвентаре
        db.get('SELECT quantity FROM inventory WHERE userId = ? AND itemId = ?', [req.session.userId, itemId], (err, row) => {
          if (row) {
            // Обновляем количество
            db.run('UPDATE inventory SET quantity = quantity + 1 WHERE userId = ? AND itemId = ?', [req.session.userId, itemId]);
          } else {
            // Вставляем новую запись
            db.run('INSERT INTO inventory (userId, itemId, quantity) VALUES (?, ?, 1)', [req.session.userId, itemId]);
          }

          db.run('COMMIT', (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Ошибка транзакции' });
            }
            getUserById(req.session.userId, (err, updated) => {
              res.json({ crystals: updated.crystals });
              broadcastLeaderboard();
            });
          });
        });
      });
    });
  });
});

app.get('/api/leaderboard', (req, res) => {
  getLeaderboard((err, data) => {
    if (err) return res.status(500).json({ error: 'Ошибка БД' });
    res.json(data);
  });
});

app.get('/api/items', (req, res) => {
  db.all('SELECT * FROM items', (err, items) => {
    if (err) return res.status(500).json({ error: 'Ошибка БД' });
    res.json(items);
  });
});

app.get('/api/achievements', (req, res) => {
  db.all('SELECT * FROM achievements', (err, achievements) => {
    if (err) return res.status(500).json({ error: 'Ошибка БД' });
    res.json(achievements);
  });
});

// Автоматический доход раз в секунду
setInterval(() => {
  db.all('SELECT id, autoRobots, autoMines, autoFarms FROM users', (err, users) => {
    if (err) return;
    users.forEach(user => {
      let income = 0;
      income += user.autoRobots * 1;
      income += user.autoMines * 2;
      income += user.autoFarms * 5;
      if (income > 0) {
        db.run('UPDATE users SET crystals = crystals + ? WHERE id = ?', [income, user.id], function(err) {
          if (!err) {
            io.to(`user-${user.id}`).emit('auto_income', { amount: income });
            broadcastLeaderboard();
          }
        });
      }
    });
  });
}, 1000);

// Восстановление здоровья (раз в минуту +5 HP)
setInterval(() => {
  db.run(`
    UPDATE users SET health = MIN(health + 5, maxHealth)
    WHERE health < maxHealth
  `);
}, 60000);

// Восстановление энергии (раз в 10 минут)
setInterval(() => {
  db.run(`
    UPDATE users SET energy = MIN(energy + 1, maxEnergy)
    WHERE energy < maxEnergy
  `);
}, 600000);

// Socket.io
io.on('connection', (socket) => {
  const userId = socket.request.session.userId;
  if (userId) {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} connected`);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});