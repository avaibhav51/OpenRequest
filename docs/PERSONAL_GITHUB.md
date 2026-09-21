# Personal GitHub setup without global Git changes

This directory is deliberately **not currently a Git repository**. The temporary `.git` metadata created during initial scaffolding was detached on 21 September 2026. No remote or commit ever existed.

When you have created an empty repository under your personal GitHub account, initialize this folder using repository-local identity only.

## 1. Initialize and set local identity

Run from `/Users/VaibhavAgarwal/AI`:

```bash
git init -b main
git config --local user.name "YOUR PERSONAL NAME"
git config --local user.email "YOUR_PERSONAL_GITHUB_NOREPLY_EMAIL"
```

Verify exactly where every relevant setting comes from:

```bash
git config --show-origin --get-regexp '^(user\.|credential\.|core\.sshCommand|url\.)'
```

The `user.name` and `user.email` lines should point to `.git/config`. Do not use `git config --global` for this project.

## 2. Use a dedicated personal GitHub SSH key

Create or select a key dedicated to the personal account, add its **public** half to GitHub, then bind only this repository to that key:

```bash
git config --local core.sshCommand "ssh -i /ABSOLUTE/PATH/TO/YOUR/PERSONAL_GITHUB_KEY -o IdentitiesOnly=yes"
```

Use an absolute key path. Never put a private key, token, or credential file inside this repository.

Then add the personal remote:

```bash
git remote add origin git@github.com:YOUR_PERSONAL_ACCOUNT/YOUR_REPOSITORY.git
git remote -v
```

This avoids relying on the work Bitbucket SSH identity or a global URL rewrite. An SSH host alias is another valid approach, but a repository-local `core.sshCommand` keeps the separation visible in this project's own configuration.

## 3. Commit and publish only after verification

```bash
git status --short
git add .
git diff --cached --check
git commit -m "Initial local-first PWA scaffold"
git push -u origin main
```

Before the first push, confirm:

- `git remote -v` names the personal GitHub repository;
- `git config --local user.email` is the desired personal/noreply address;
- `git config --local core.sshCommand` points to the personal key;
- `git log -1 --format='%an <%ae>'` shows the personal identity;
- `.env`, credentials, local collections, and secrets are not staged.

## HTTPS alternative

HTTPS can work, but the macOS Keychain credential helper is global and may select an existing account. If strict account isolation matters, prefer the repository-bound SSH key above. Do not store a personal access token in `.git/config`, a remote URL, `.env`, or shell history.

## GitHub repository settings

For a public personal repository, enable private vulnerability reporting, Dependabot alerts, secret scanning where GitHub offers it for public repositories, branch protection/rulesets for `main`, and required CI checks. These hosted conveniences are not runtime dependencies; contributors can run the project and checks locally.
