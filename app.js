const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const express = require('express');
const app = express();
const path = require('path');
const port = 3000;
const crypto = require('crypto');
const session = require('express-session');
app.use(express.json());

app.use(express.urlencoded({ extended: false }));
const SAULT = "koshechka";  // для засаливания паролей

app.use('/node_modules', express.static('node_modules'));
app.use('/styles', express.static('styles'));

app.use(        // настройка сессии
    session({
        secret: 'kartoshka',
        resave: true,
        saveUninitialized: true,
    })
);

function is_auth_admin (req, res, next) {
    let auth = req.session.loggedin;
    let is_admin = req.session.isAdmin;
    if (auth && is_admin) {
        next();
    } else {
        res.redirect('/');
    }
}

function is_auth (req, res, next) {
    let auth = req.session.loggedin;
    if (auth == true) {
        next();
    } else {
        res.redirect('/');
    }
}

app.get('/api/isadmin', async (req, res) => {
    let is_admin = req.session.isAdmin;
    if (is_admin == undefined){
        is_admin = null;
    }
    res.json(is_admin);
});

app.get('/', (req,res) => {  //главная страница со статьями
    res.sendFile(path.join(__dirname,'/templates') + '/index.html');
});

app.get('/api/articleList', async (req, res) => {
    const articles = await prisma.article.findMany({
        orderBy: { date_published: 'desc'},
        where: { isPublished: true}
    });
    res.json(articles);
});

app.get('/api/articleListModerate', async (req, res) => {
    const articles = await prisma.article.findMany({
        orderBy: { date_published: 'desc'},
        where: { isModerating: true}
    });
    res.json(articles);
});

app.get('/api/userArticles', async (req, res) => {
    const articles = await prisma.article.findMany({
        where: { authorId: req.session.userid },
        orderBy: { id: 'desc' }
    });
    res.json(articles);
});

app.post('/article/accept', is_auth_admin, async (req,res) => {  //публикация статьи
    let now = new Date();
    let update = await prisma.article.update({
        where: {
            id: req.body.id,
        },
        data: {
            isPublished: true,
            isModerating: false,
            date_published: now,
        },
    })
    res.json('accept');
});

app.post('/article/reject', is_auth_admin, async (req,res) => {  //отклонение статьи
    let reject = await prisma.article.update({
        where: {
            id: req.body.id,
        },
        data: {
            isModerating: false,
            isPublished: false,
        },
    });
    res.json('reject');
});

app.post('/article/del', is_auth_admin, async (req,res) => {
    let del = await prisma.article.delete({
        where: {id: req.body.id}
    })
    res.json('delete');
})

app.get('/article/edit', is_auth, (req,res) => { //создание статьи
    res.sendFile(path.join(__dirname,'/templates') + '/article_create.html');
});

app.post('/article/edit', is_auth, async (req,res) => { //отправка на модерацию
    const new_article = await prisma.article.create({
        data:{
            name: req.body.name_article,
            text_article: req.body.text_article,
            isPublished: false,
            isModerating: true,
            authorId: req.session.userid,
        }
    })
    res.redirect('/article/sendOnModerate');
})

app.get('/article/sendOnModerate', is_auth, (req, res) => {
    res.sendFile(path.join(__dirname,'/templates') + '/send_on_moderate.html');
});

app.get('/article/moderate', is_auth_admin, (req,res) => {  //страница админа
    res.sendFile(path.join(__dirname,'/templates') + '/article_moderate.html');
});

app.get('/article/:pk', (req,res) => { //просмотр статьи + кнопки админа
    res.sendFile(path.join(__dirname,'/templates') + '/article.html');
});

app.get('/api/concretArticle/:pk', async (req,res) => {
    let numOfArticle = req.params['pk'];
    const article = await prisma.article.findFirst({
        where: {id: Number(numOfArticle)}
    });
    res.json(article);
})

app.get('/user/login', (req,res) => {
    res.sendFile(path.join(__dirname,'/templates') + '/login.html');
});

app.post('/user/login', async (req,res) => {
    let username = req.body.username;
    let pass = req.body.pass;
    if(username && pass) {
        let hash_pass = crypto.createHash('sha256').update(pass + SAULT).digest('hex');
        const current_user = await prisma.user.findFirst({
            where: {login: username, password: hash_pass}
        });
        if (current_user != null) {
            req.session.loggedin = true;
            req.session.isAdmin = current_user.isAdmin;
            req.session.userid = current_user.id;

            res.redirect('/');
        } else {
            res.sendFile(path.join(__dirname,'/templates') + '/login_error.html');
        }
    } else {
        res.redirect('/user/login');
    }
});

app.get('/user/registrate', (req,res) => {
    res.sendFile(path.join(__dirname,'/templates') + '/registrate.html');
});

app.post('/user/registrate', async (req,res) => {
    const check_name = await prisma.user.findFirst({
        where: {login: req.body.username}
    })
    console.log(check_name);
    if (check_name == null){
        let pass = req.body.pass + SAULT;
        let hash_pass = crypto.createHash('sha256').update(pass).digest('hex');
        const user = await prisma.user.create({
            data:{
                login: req.body.username,
                password: hash_pass,
                isAdmin: req.body.as_admin == 'on'
            }
        })
    } else {
        throw "Такое имя пользователя уже существует.";
    }
    res.redirect('/user/login');
});

app.get('/user/logout', (req, res) =>{
    req.session.destroy();
    res.redirect('/');
})

app.get('/user', is_auth, (req,res) => {  // страница пользователя
    res.sendFile(path.join(__dirname,'/templates') + '/user.html');
});

app.get('/api/concretUser', async (req,res) => {
    let user_id = req.session.userid;
    const user = await prisma.user.findFirst({
        where: {id: Number(user_id)}
    });
    res.json(user);
})

app.post('/api/author', async (req, res) => {
    let author_id = req.body.id;
    const author = await prisma.user.findFirst({
        where: { id: Number(author_id)}
    });
    res.json(author);
});

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});