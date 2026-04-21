# Game Clicker - Полное руководство развертывания

## Архитектура

- **Frontend:** GitHub Pages (папка `docs/`)
- **Backend:** Render.com (Node.js + Express)
- **БД:** SQLite с автоматической синхронизацией в GitHub

---

## Шаг 1: Подготовка локальной машины

```bash
# Клонируем или переходим в папку проекта
cd game_clicker_test

# Устанавливаем зависимости
npm install

# Проверяем, что всё работает локально
npm start
# Откройте http://localhost:3000
```

---

## Шаг 2: Развертывание Backend на Render

### 2.1 Создание Web Service

1. Перейдите на https://render.com
2. Нажмите **"New +"** → **"Web Service"**
3. Выберите ваш GitHub репозиторий `game_clicker_test`
4. Заполните поля:
   - **Name:** `game-clicker`
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Instance Type:** Free

5. Нажмите **"Create Web Service"**

### 2.2 Настройка GitHub Auto-Sync

1. В Render Dashboard, откройте ваш Web Service
2. Перейдите на вкладку **"Environment"**
3. Нажмите **"Add Environment Variable"**
4. Добавьте переменную:
   - **Key:** `GIT_TOKEN`
   - **Value:** [Ваш GitHub Personal Access Token]

### 2.3 Создание GitHub Personal Access Token

1. На GitHub: https://github.com/settings/tokens/new
2. **Scope:** Выберите `repo` (полный доступ к репозиторию)
3. **Expiration:** 90 дней (или выше)
4. Нажмите "Generate token"
5. **Скопируйте токен и добавьте в Render** (как выше)

### 2.4 Получение URL сервера

После развертывания на Render вы получите URL вроде:
```
https://game-clicker-xxxxx.onrender.com
```

---

## Шаг 3: Обновление Frontend

### 3.1 Обновите `docs/script.js`

Найдите эту строку (около строки 3):
```javascript
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://YOUR_RENDER_URL.onrender.com'; // ← ЗАМЕНИТЕ ЭТОТ URL
```

Замените `https://YOUR_RENDER_URL.onrender.com` на ваш реальный URL с Render:
```javascript
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : 'https://game-clicker-xxxxx.onrender.com';
```

### 3.2 Коммитим и пушим изменения

```bash
git add docs/script.js package.json server.js .gitignore .env.example Procfile GITHUB_SYNC_SETUP.md
git commit -m "Setup GitHub auto-sync and Render deployment"
git push origin main
```

---

## Шаг 4: Включение GitHub Pages

1. Откройте Settings репозитория → **Pages**
2. **Source:** Выберите `Deploy from a branch`
3. **Branch:** Выберите `main` и папку `/docs`
4. Нажмите Save

Через 5 минут ваш сайт будет доступен по адресу:
```
https://YOUR_USERNAME.github.io/game_clicker_test
```

---

## Как это работает

### Во время игры:
1. Игрок заходит на `https://YOUR_USERNAME.github.io/game_clicker_test` (GitHub Pages)
2. Frontend подключается к серверу: `https://game-clicker-xxxxx.onrender.com`
3. Все запросы идут через API и сохраняются в БД на Render

### Синхронизация БД с GitHub:
1. Каждые 30 секунд сервер проверяет изменения в БД (`db.sqlite`)
2. Если есть изменения → коммитит и пушит в GitHub
3. БД всегда синхронизирована между Render и GitHub

---

## Решение проблем

### "404 File not found" на GitHub Pages
- Убедитесь, что в папке `docs/` есть `index.html`
- Проверьте GitHub Pages Settings → Source должен быть `/docs`

### "CORS error" при подключении к API
- Проверьте, что `API_URL` в `docs/script.js` совпадает с вашим Render URL
- Убедитесь, что в `server.js` установлен `cors: { origin: "*" }`

### Git sync не работает
- Проверьте, что `GIT_TOKEN` добавлен в Render Environment Variables
- Убедитесь, что токен имеет `repo` scope
- Посмотрите логи Render: в Dashboard → Logs

### Сервер не запускается
- Проверьте: `npm install` установил все зависимости
- Посмотрите логи Render
- Убедитесь, что `db.sqlite` в репозитории

---

## Команды для локальной разработки

```bash
# Запуск сервера
npm start

# Просмотр логов
npm start 2>&1 | tail -f

# Очистка БД и сброс
rm db.sqlite
npm start

# Проверка git статуса
git status
git log --oneline
```

---

## Безопасность

⚠️ **Важно:**
- Не коммитьте `.env` файл в GitHub (используйте `.env.example`)
- GitHub Personal Access Token - храните как секрет
- Периодически обновляйте токен (каждые 90 дней)

---

## Дополнительные ресурсы

- Render документация: https://render.com/docs
- GitHub Pages: https://pages.github.com
- SQLite3 для Node.js: https://github.com/TryGhost/node-sqlite3
- Express.js: https://expressjs.com
