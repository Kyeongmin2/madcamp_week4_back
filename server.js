const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const cors = require("cors");

const port = 80;
const host = '0.0.0.0';
server.listen(port, () => {
  console.log(`서버가 http://${host}:${port} 에서 실행 중입니다.`);
});

app.use(cors({
    origin: 'http://172.10.5.177:80'
}));

app.use(express.static(path.join(__dirname, 'build')));

// Handle other routes by serving the index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});


// 변수 설정

const health_point = 100 // 입장 시 유저 체력
const spawn_point = [[2,16],[2,57],[16,23],[52,52],[40,39],[57,2]]; // 열/행 순임 tile coordinate
const tile_size = 32; // Tiled Map 타일 사이즈
const map_x = 1920; // map 너비 px
const map_y = 1920; // map 높이 px
const item_spawn_interval = 10000; 
const max_item_num = 5;

// 맵에서 벽 정보 얻기 - 아이템을 벽에 생성하지 않도록 하기 위함.
var wall;
// bullte id 부여
var bulletId = 0;
var itemId = 0;
var num_item = 0; // 현재 맵에 있는 item 수
const items = {};


// JSON 파일을 읽어와 wall 변수에 저장
try {
    const wallData = fs.readFileSync('wall_data.json', 'utf8');
    data = JSON.parse(wallData); 
    wall = data['wall_tile_coordinate'];
    console.log("Read Wall Data done & Set Item Spawn");
  } catch (err) {
    console.error('Error reading wall.json file:', err);
}

// 랜덤 스폰 위치 결정
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 아이템 생성
function spawnItem(){
    if(num_item < max_item_num){
        console.log("Item :", num_item);
        let x = getRandomInt(0,map_x/tile_size - 1);
        let y = getRandomInt(0,map_y/tile_size - 1);

        while(wall[y][x]===1 || (y===41 && x===29) || (y===41 && x === 32) || (x===58 && y===58) || (x<=2 && y<=2)){
            x = getRandomInt(0,map_x/tile_size - 1);
            y = getRandomInt(0,map_y/tile_size - 1);
        }

        io.emit("spawn_item", {id:itemId, x:x*tile_size,y:y*tile_size});
        items[itemId] = {x:x*tile_size, y:y*tile_size};
        num_item += 1;
        itemId += 1;
    }
    return; 
}

itemSpawnTimer = setInterval(spawnItem, item_spawn_interval);


class Player{
    constructor(socket, name){
        this.socket = socket;
        this.nickname = name;
        const pos = getRandomInt(0, spawn_point.length-1);
        this.x = tile_size * spawn_point[pos][0];
        this.y = tile_size * spawn_point[pos][1];
        this.state = health_point; // 체력
        this.dx=0;
        this.dy=0;
        this.kill=0;
        this.hit=0;
        this.weapon=1;
    }

    get id() {
        return this.socket.id;
    }
}

var playermap = {};

function joinGame(socket, name){
    let player = new Player(socket, name);
    playermap[socket.id] = player;
    return player;
}

function endGame(socket){
    delete playermap[socket.id];
};

io.on('connection', (socket) => {
    console.log('새로운 사용자가 연결되었습니다.');
    let nickname1='';
    socket.on('disconnect', function(reason){
      console.log(`${socket.id}님이 ${reason}의 이유로 퇴장하셨습니다. `);
      endGame(socket);
      io.sockets.emit('leave_user', socket.id);
    
    });

    socket.on('username', (nickname) =>{
        nickname1 = nickname;
        console.log('닉네임',nickname1);
        const newPlayer = joinGame(socket, nickname1);

        //console.log('유저:', newBall);
        socket.emit('user_id', socket.id);
        socket.emit('item_init', items);

        for (let userId in playermap){
            let currentplayer = playermap[userId];
            //console.log('유저들:', currentplayer);
            socket.emit('join_user', {
                id: currentplayer.id,
                nickname: currentplayer.nickname,
                x: currentplayer.x,
                y: currentplayer.y,
                dx: currentplayer.dx,
                dy: currentplayer.dy,
                state : currentplayer.state,
                kill : currentplayer.kill,
                weapon: currentplayer.weapon
            });
        };

        socket.broadcast.emit('join_user',{
            id: newPlayer.id,
            nickname: newPlayer.nickname,
            x: newPlayer.x,
            y: newPlayer.y,
            dx: newPlayer.dx,
            dy: newPlayer.dy,
            state : newPlayer.state,
            kill : newPlayer.kill,
            weapon : newPlayer.weapon
        });        
    }); 

    socket.on('send_location', function(data) {
        socket.broadcast.emit('update_state', {
            id: data.id,
            nickname: data.nickname,
            x: data.x,
            y: data.y,
            dx: data.dx,
            dy: data.dy,
            state : data.state,
            kill : data.kill,
            hit: data.hit,
            weapon: data.weapon
        });
    });

    socket.on('shoot_bullet', (data) => {

        //console.log('총알', data)
        data.bulletId = bulletId;
        io.emit('bullets', data);
        bulletId += 1;
    });

    socket.on('shoot_fire', (data) => {
        io.emit('fires', data);
    });

    socket.on('knifeswing', (data) => {
        io.emit('knifeswings', data);
    });

    socket.on('bombthrowing', (data) => {
        console.log('폭탄', data)
        io.emit('bombs', data);
    });
    
    socket.on('collision', (data)=>{
        socket.broadcast.emit('deletebullet', data);
    });

    socket.on('death', (dead_user, bullet)=>{
        io.emit('killed', dead_user, bullet);
    });

    socket.on('deathknife', (dead_user, knifeswing)=>{
        io.emit('killed', dead_user, knifeswing)
    });
    

    socket.on('eat_item', (item_id)=>{
        delete items[item_id];
        num_item -= 1;
        socket.broadcast.emit('delete_item', item_id);
    });

});