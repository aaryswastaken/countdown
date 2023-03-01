# ✨ ***countdown*** ✨ 

Countdown is a simple application build to display countdowns, made to replace a page on my github.io that I had to edit and commit everytime I had a new countdown to watch 

Here's how I run it (this project has not really been developped in the idea of someone other than me ever using it):

```shell
docker build -t countdown:1.1 .
docker run -d --name countdown -v countdown_cache:/usr/src/app/cache -e PROD=true -p 8080:80 countdown:1.15
docker exec countdown node newuser.js <username> <password> <display name>
```

(it's not optimized in any way)