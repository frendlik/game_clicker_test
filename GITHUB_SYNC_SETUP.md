# Настройка GitHub Auto-Sync на Render

## Шаг 1: Создать Personal Access Token на GitHub

1. Откройте https://github.com/settings/tokens?type=beta
2. Нажмите "Generate new token"
3. Дайте имя токену (например "render-db-sync")
4. Выберите **Permissions:**
   - `Contents: Read and Write` (для push)
   - `Metadata: Read-only`
5. Нажмите "Generate token"
6. **Скопируйте токен** (он больше не будет показан!)

## Шаг 2: Добавить токен в Render

1. В dashboard Render, откройте ваш Web Service
2. Нажмите "Environment" → "Add Environment Variable"
3. Добавьте переменную:
   - **Key:** `GIT_TOKEN`
   - **Value:** Ваш GitHub Personal Access Token

## Шаг 3: Обновить server.js с токеном

Раскомментируйте и используйте следующий код:

```javascript
// После require('simple-git')
const git = simpleGit();

// Настроим git с токеном для автоматического push
const githubToken = process.env.GIT_TOKEN;
if (githubToken) {
  git.addConfig('user.email', 'render@example.com');
  git.addConfig('user.name', 'Render Auto-Sync');
  // Обновляем origin URL с токеном
  git.remote(['set-url', 'origin', `https://${githubToken}@github.com/YOUR_USERNAME/game_clicker_test.git`]);
}
```

## Шаг 4: Убедиться, что db.sqlite в git

```bash
git add db.sqlite
git commit -m "Add database file"
git push
```

---

**Важно:** Токен действует по умолчанию 90 дней. Когда истекает, нужно создать новый и обновить в Render.
