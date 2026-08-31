# Seguridad - Token

El token `ghp_...` usado para el push inicial está guardado en `~/.git-credentials` via `credential.helper store`.

Recomendación: después de verificar que `git push` ya no pide password, revoca el token clásico en GitHub:
Settings → Developer settings → Personal access tokens → Tokens (classic) → Delete `AlojaU`

Para futuros pushes usa `gh auth login` o SSH (más seguro):
```bash
ssh-keygen -t ed25519 -C "adcaicedo@unicauca.edu.co"
cat ~/.ssh/id_ed25519.pub  # pégalo en GitHub → Settings → SSH and GPG keys → New SSH key
git remote set-url origin git@github.com:Temaru31/AlojaU.git
```

No compartas el ghp_ en chats.
