const imagemin = require('imagemin');
const imageminMozjpeg = require('imagemin-mozjpeg');
process.stdout.write('\x1b[2J');
process.stdout.write('\x1b[0f');
for (let i = 0; i < 200; i++){ console.log("------------------------"); }
process.stdout.write('\x1b[2J');
process.stdout.write('\x1b[0f');

const puppeteer = require('puppeteer');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', (req, res)=> res.sendFile(__dirname + '/index.html'));
app.get('/client.js', (req, res)=> res.sendFile(__dirname + '/client.js'));
app.get('/patch.js', (req, res)=> res.sendFile(__dirname + '/patch.js'));
var Readable = require('stream').Readable
const rate = 10;

io.on('connection', async (socket) => {
    console.log('a user connected');
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();
    socket.on('disconnect', async function(){
        clearInterval(id);
        await browser.close();
        console.log('browser closed');
    });

    let scrollY = 0;
    socket.emit('READY_FOR_TRANSPORT');
    let id;

    let viewport = {
        x: 0, y: 0, 
        width: 1024, 
        height: 768
    };

    socket.on('VIEWPORT_CHANGE_REQUEST', async (e) => {
        viewport = {
            x: viewport.x, y: viewport.y, 
            width: e.width, 
            height: e.height
        }
        await page.setViewport(viewport);
        socket.emit('EVENT_VIEWPORT_CHANGE');
    });

    page.on('domcontentloaded', async () => {
        await page.evaluate(_ => {
            window.cursor = document.createElement('div');
            window.cursor.style.position = "fixed";
            window.cursor.style.width = "100px";
            window.cursor.style.color = "white";
            window.cursor.style.height = "20px";
            window.cursor.style.border = "2px solid black";
            window.cursor.style.backgroundColor = "red";
            window.cursor.style.left = "100px";
            window.cursor.style.top = "100px";
            window.cursor.style.zIndex = Number.MAX_SAFE_INTEGER-1;
            window.cursor.style.pointerEvents = "none";
            document.body.appendChild(window.cursor);

            // window.scrollGuide = document.createElement('div');
            // window.scrollGuide.style.position = "fixed";
            // window.scrollGuide.style.width = "100vw";
            // window.scrollGuide.style.color = "white";
            // window.scrollGuide.style.height = "100vh";
            // window.scrollGuide.style.backgroundColor = "rgba(255, 0, 0, 0.5)";
            // window.scrollGuide.style.left = "0";
            // window.scrollGuide.style.top = "0";
            // window.scrollGuide.style.zIndex = Number.MAX_SAFE_INTEGER+1;
            // window.scrollGuide.style.pointerEvents = "none";
            // document.body.appendChild(window.scrollGuide);
        });
    })
    socket.on('NAVIGATION_REQUEST', async (e) => { 
        console.log('browser navigated');
        await page.goto(e.url);        
        let lastBuff = "";
        let lastURL;
        let lastTitle;
        let sendBuffer = async () => {
            try {
                let title = await page.title();
                if (lastTitle != title){
                    socket.emit('EVENT_TITLE_CHANGE', title);
                    lastTitle = title;
                }
                let url = page.url();
                if (lastURL != url){
                    socket.emit('EVENT_URL_CHANGE', url);
                    lastURL = url;
                }

                let b = await page.screenshot({ 
                    clip: viewport, 
                    type: 'jpeg', 
                    quality: 100 
                });

                const data = (await imagemin.buffer(b, {
                    plugins: [
                        imageminMozjpeg({
                            quality: 75,
                            tune: 'ms-ssim',
                            smooth: 100,
                            dct: 'float',
                            dcScanOpt: 2
                        })
                    ]
                })).toString('base64');

                if (lastBuff != data){
                    socket.emit('EVENT_SCREEN_BUFFER', data);
                    lastBuff = data;
                }   
               
            } catch(e){
                console.error(e);
            }
        };
        clearInterval(id);
        id = setInterval(sendBuffer, rate);
    });

    let keysPressed = [];
    socket.on('EVENT_KEYUP',   async (e) => {
        console.log("EVENT_KEYUP " + e.key); 
        let idx = keysPressed.indexOf(e.key);
        if (idx == -1){
            console.log("Sending key up " + e.key + " to Chrome");
            await page.keyboard.up(e.key);
            console.log("Sent key up " + e.key + " to Chrome");
        } else {
            keysPressed.splice(idx, 1);
        }
    });
    socket.on('EVENT_KEYDOWN', async (e) => { 
        console.log("EVENT_KEYDOWN " + e.key);
        console.log("Sending key down " + e.key + " to Chrome");
        await page.keyboard.down(e.key) 
        console.log("Sent key down " + e.key + " to Chrome");
    });
    socket.on('EVENT_KEYPRESS', async (e) => {
        console.log("EVENT_KEYPRESS " + e.key);
        keysPressed.push(e.key);
        if (e.shiftKey || e.ctrlKey || e.altKey){
            console.log("Sending key press " + e.key + " to Chrome");
            await page.keyboard.press(e.key)
            console.log("Sent key press " + e.key + " to Chrome");
        }
    });
    socket.on('EVENT_MOUSEMOVE', async (e) => {
        let x = e.x;
        let y = viewport.y + e.y;

        try {
            await page.mouse.move(x, y);
            await page.evaluate((x, y) => {
                if (window.cursor){
                    window.cursor.style.left = x + "px";
                    window.cursor.style.top = y + "px";
                    window.cursor.innerText = x + ',' + y;
                }
            }, x, y);
        }
        catch (e){
        }
    });

    socket.on('EVENT_MOUSEUP', async (e) => await page.mouse.up(e.button));
    socket.on('EVENT_MOUSEDOWN', async (e) =>  await page.mouse.down(e.button));
    socket.on('EVENT_MOUSESCROLL', async (e) =>  {
        scrollY += e.delta;
        scrollY = scrollY < 0 ? 0 : scrollY;
        await page.evaluate(
            (scrollY) => { 
                document.documentElement.style.marginTop = "-" + scrollY + "px";
            }, 
            scrollY
        );
    });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});