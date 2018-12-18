const IO_NETWORK_THROTTLE = 51;

class App {

    emit(name, packet, log) {
        this.socket.emit(name, packet);
            console.log(name, packet);
    }

    init() {
        this.socket = io({ reconnection: false });

        let screen = $('#screen');
        screen[0].focus();
        let url = $('#url');
        let title = $('#title');
        url.keydown((_) =>{ 
            _.stopPropagation()
            _.stopImmediatePropagation();
        });
        url.keypress((event)=>{
            if (event.keyCode === 10 || event.keyCode === 13) {
                this.requestURL = url.val();

                if (!this.requestURL.startsWith('http')){
                    this.requestURL = "http://google.com/?q="+ this.requestURL;
                }
                this.emit('NAVIGATION_REQUEST', { url: this.requestURL });
            }
        });       

        $( window ).resize(_.throttle(() => this.emit('VIEWPORT_CHANGE_REQUEST', { width: screen.width(), height: screen.height() }), 2000, { leading: true, trailing: true }) );
        this.socket.on('connect', () => {
            this.socket.on('READY_FOR_TRANSPORT', () => {
                console.log('socket connected');
                this.emit('VIEWPORT_CHANGE_REQUEST', { width: screen.width(), height: screen.height() });
            });
            this.socket.once('EVENT_VIEWPORT_CHANGE', () => {
                this.requestURL = window.location.hash ? window.location.hash.substr(1) : 'http://www.nu.nl';
                this.emit('NAVIGATION_REQUEST', { url: this.requestURL });
            })
            this.socket.on('EVENT_SCREEN_BUFFER', (e) => { 
                screen.attr('src', 'data:image/jpeg;base64,' + e);
            });

            this.socket.on('EVENT_URL_CHANGE', (buffer) => url.val(buffer));
            this.socket.on('EVENT_TITLE_CHANGE', (buffer) => title.val(buffer));
        });
        screen.on('dragstart', (event) => event.preventDefault());            
        screen.on("contextmenu",() => false);
        screen.on('mousedown', (e) => { 
            screen[0].focus();
            let btn = { 0: 'left', 1: '', 2: 'right'}[e.button];
            this.emit('EVENT_MOUSEDOWN', { button: btn })
            e.preventDefault();
        });
        screen.on('mouseup', (e) => { 
            let btn = { 0: 'left', 1: '', 2: 'right'}[e.button];
            this.emit('EVENT_MOUSEUP',  { button: btn })
            e.preventDefault();
        });
        screen.on('mousemove', _.throttle((e) => this.emit('EVENT_MOUSEMOVE', { x: e.offsetX, y: e.offsetY }), IO_NETWORK_THROTTLE));
        let eventToPacket = ((event) => {
            return { 
                key: event.originalEvent.code, 
                shiftKey: event.originalEvent.shiftKey, 
                ctrlKey: event.originalEvent.ctrlKey, 
                altKey: event.originalEvent.altKey 
            }
        });
        let makeKeyHandler = (eventName, throttle, trailing, leading) => _.throttle(
            (event) => this.emit(eventName, eventToPacket(event), true), 
            throttle, { trailing: trailing, leading: leading }
        );
        $(screen).keydown(makeKeyHandler('EVENT_KEYDOWN', IO_NETWORK_THROTTLE, false,true));
        $(screen).keypress(makeKeyHandler('EVENT_KEYPRESS', IO_NETWORK_THROTTLE));
        $(screen).keyup(makeKeyHandler('EVENT_KEYUP', IO_NETWORK_THROTTLE, false, true));
        $(window).on('DOMMouseScroll mousewheel', (event) => {
            if(event.originalEvent.detail > 0 || event.originalEvent.wheelDelta < 0 ) {
                this.emit('EVENT_MOUSESCROLL', { delta: 50 });
            } else {
                this.emit('EVENT_MOUSESCROLL', { delta: -50 });
            }
            return false;
        });
    }
}

window.app = new App();
$(app.init.bind(app));