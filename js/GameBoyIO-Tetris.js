"use strict";
var gameboy = null;						//GameBoyCore object.
var gbRunInterval = null;				//GameBoyCore Timer
var settings = [						//Some settings.
	true, 								//Turn on sound.
	true,								//Boot with boot ROM first?
	false,								//Give priority to GameBoy mode
	1,									//Volume level set.
	true,								//Colorize GB mode?
	false,								//Disallow typed arrays?
	8,									//Interval for the emulator loop.
	10,									//Audio buffer minimum span amount over x interpreter iterations.
	20,									//Audio buffer maximum span amount over x interpreter iterations.
	false,								//Override to allow for MBC1 instead of ROM only (compatibility for broken 3rd-party cartridges).
	false,								//Override MBC RAM disabling and always allow reading and writing to the banks.
	false,								//Use the GameBoy boot ROM instead of the GameBoy Color boot ROM.
	false,								//Scale the canvas in JS, or let the browser scale the canvas?
	true,								//Use image smoothing based scaling?
    [true, true, true, true]            //User controlled channel enables.
];

// 添加：自动加载的ROM文件路径
var AUTO_ROM_PATH = "./game/tetris.gb"; // 游戏ROM的路径，可以根据需要修改文件名

// 添加：存储最后检测到的分辨率
var lastResolution = {width: 0, height: 0};

// 添加：将ArrayBuffer转换为字符串的函数
function arrayBufferToString(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return binary;
}

// 修改：自动检测游戏比例并设置显示模式
function autoDetectGameRatio() {
    var canvas = document.getElementById("mainCanvas");
    if (!canvas || !gameboy) return;

    // 等待游戏画面渲染完成
    setTimeout(function() {
        var width = canvas.width || 160;  // GameBoy原始宽度
        var height = canvas.height || 144; // GameBoy原始高度
        var gameName = (gameboy.name || "").toLowerCase();

        // 移除之前可能添加的类
        document.body.classList.remove("horizontal-game", "vertical-game", "square-game");
        document.body.style.removeProperty('--gameboy-aspect-ratio');

        // 优先根据游戏名称判断（更准确的识别）
        if (gameName.includes('tetris') || gameName.includes('tetrin') ||
            gameName.includes('block') || gameName.includes('puzzle')) {
            // 俄罗斯方块等方块类游戏强制设为竖版
            document.body.classList.add("vertical-game");
            document.body.style.setProperty('--gameboy-aspect-ratio', '3/4');
            cout(`检测到${gameName}为方块类游戏，强制设为竖版模式`, 0);
        } else {
            // 根据实际分辨率比例判断
            var ratio = height / width;  // 改为高宽比，更适合判断竖版

            if (ratio >= 1.2) {
                // 竖版游戏 (高明显大于宽)
                document.body.classList.add("vertical-game");
                document.body.style.setProperty('--gameboy-aspect-ratio', '3/4');
            } else if (ratio <= 0.8) {
                // 横版游戏 (宽明显大于高)
                document.body.classList.add("horizontal-game");
                document.body.style.setProperty('--gameboy-aspect-ratio', '16/9');
            } else {
                // 接近1:1 比例
                document.body.classList.add("square-game");
                document.body.style.setProperty('--gameboy-aspect-ratio', '1/1');
            }
        }

        // 更新canvas显示
        if (canvas.style.visibility !== 'visible') {
            canvas.style.visibility = 'visible';
        }

        // 记录当前分辨率
        lastResolution.width = width;
        lastResolution.height = height;

        // 触发窗口重排事件
        window.dispatchEvent(new Event('resize'));

        // 调试信息
        cout(`游戏: ${gameName}, 分辨率: ${width}x${height}, 高宽比: ${ratio?.toFixed(2)}:1, 模式: ${document.body.className}`, 0);
    }, 800); // 增加等待时间确保渲染完成
}


function checkResolutionChange() {
    var canvas = document.getElementById("mainCanvas");
    if (!canvas || !gameboy) return;

    var currentWidth = canvas.width || 160;
    var currentHeight = canvas.height || 144;
    var gameName = (gameboy.name || "").toLowerCase();

    if (currentWidth !== lastResolution.width || currentHeight !== lastResolution.height) {
        cout(`分辨率变化: ${lastResolution.width}x${lastResolution.height} -> ${currentWidth}x${currentHeight}`, 0);
        lastResolution.width = currentWidth;
        lastResolution.height = currentHeight;

        // 特殊处理：如果是俄罗斯方块或方块类游戏，强制设为竖版
        if (gameName.includes('tetris') || gameName.includes('tetrin') ||
            gameName.includes('block') || gameName.includes('puzzle')) {
            cout(`检测到${gameName}为方块类游戏，强制设为竖版模式`, 0);
            document.body.classList.remove("horizontal-game", "vertical-game", "square-game");
            document.body.classList.add("vertical-game");
            document.body.style.setProperty('--gameboy-aspect-ratio', '3/4');

            if (canvas.style.visibility !== 'visible') {
                canvas.style.visibility = 'visible';
            }
            window.dispatchEvent(new Event('resize'));
            return true;
        }

        autoDetectGameRatio();
        return true;
    }
    return false;
}

// 添加：自动加载ROM函数
function loadAutoROM() {
    cout("正在自动加载游戏ROM...", 0);

    // 显示加载状态
    var loadingStatus = document.getElementById("loadingStatus");
    var canvas = document.getElementById("mainCanvas");

    if (loadingStatus) {
        loadingStatus.style.display = "block";
        loadingStatus.innerHTML = `
            <div style="text-align: center;">
                <div style="margin-bottom: 10px;">loading...</div>
                <div style="width: 100px; height: 4px; background: rgba(255,255,255,0.2); margin: 0 auto; border-radius: 2px; overflow: hidden;">
                    <div id="loadingBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #9e32c8, #f37500); transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    }

    if (canvas) {
        canvas.style.visibility = "hidden"; // 隐藏canvas直到加载完成
    }

    // 创建XMLHttpRequest来加载ROM文件
    var xhr = new XMLHttpRequest();
    xhr.open("GET", AUTO_ROM_PATH, true);
    xhr.responseType = "arraybuffer";

    // 更新进度条
    xhr.onprogress = function(e) {
        if (e.lengthComputable && loadingStatus) {
            var percentComplete = (e.loaded / e.total) * 100;
            var loadingBar = document.getElementById("loadingBar");
            if (loadingBar) {
                loadingBar.style.width = percentComplete + "%";
            }
        }
    };

    xhr.onload = function(e) {
        if (xhr.status === 200 || xhr.status === 0) {
            cout("ROM文件加载成功，大小: " + xhr.response.byteLength + " 字节", 0);

            // 将ArrayBuffer转换为字符串（GameBoyCore期望字符串格式的ROM）
            var romString = arrayBufferToString(xhr.response);

            // 获取canvas元素
            var canvas = document.getElementById("mainCanvas");
            if (canvas) {
                // 更新加载状态
                if (loadingStatus) {
                    var loadingBar = document.getElementById("loadingBar");
                    if (loadingBar) {
                        loadingBar.style.width = "100%";
                    }
                    setTimeout(() => {
                        loadingStatus.style.display = "none";
                    }, 500);
                }

                // 启动游戏 - 传递字符串格式的ROM
                start(canvas, romString);
                cout("游戏已自动启动", 0);

                // 开始定期检查分辨率变化
                setInterval(checkResolutionChange, 1000);
            } else {
                cout("错误：无法找到canvas元素", 2);
                if (loadingStatus) {
                    loadingStatus.style.display = "none";
                }
            }
        } else {
            cout("错误：无法加载ROM文件，状态码：" + xhr.status, 2);

            // 尝试不同的路径
            if (AUTO_ROM_PATH === "./game/tetris.gb") {
                cout("尝试使用不同的路径加载...", 0);
                AUTO_ROM_PATH = "tetris.gb";
                loadAutoROM();
                return;
            }

            alert("无法加载游戏ROM文件。请确保游戏文件位于: " + AUTO_ROM_PATH);
            if (loadingStatus) {
                loadingStatus.style.display = "none";
            }
        }
    };

    xhr.onerror = function(e) {
        cout("错误：加载ROM文件时发生网络错误", 2);

        // 尝试不同的路径
        if (AUTO_ROM_PATH === "./game/tetris.gb") {
            cout("尝试使用不同的路径加载...", 0);
            AUTO_ROM_PATH = "tetris.gb";
            loadAutoROM();
            return;
        }

        alert("网络错误：无法加载游戏ROM文件。请检查文件路径: " + AUTO_ROM_PATH);
        if (loadingStatus) {
            loadingStatus.style.display = "none";
        }
    };

    // 设置超时
    xhr.timeout = 10000; // 10秒超时
    xhr.ontimeout = function(e) {
        cout("错误：加载ROM文件超时", 2);
        alert("加载游戏ROM文件超时。请检查文件路径: " + AUTO_ROM_PATH);
        if (loadingStatus) {
            loadingStatus.style.display = "none";
        }
    };

    xhr.send();
}

// 添加：调试信息输出函数（如果未定义）
function cout(message, level) {
    if (DEBUG_MESSAGES || level > 0) {
        console.log(message);
        // 也可以输出到终端窗口
        var terminalOutput = document.getElementById("terminal_output");
        if (terminalOutput) {
            var newMessage = document.createElement("div");
            newMessage.textContent = message;
            terminalOutput.appendChild(newMessage);
            // 自动滚动到底部
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
    }
}

// 如果DEBUG_MESSAGES未定义，设置默认值
if (typeof DEBUG_MESSAGES === 'undefined') {
    DEBUG_MESSAGES = true; // 设为true以便调试
}

function start(canvas, ROM) {
    clearLastEmulation();
    autoSave();	//If we are about to load a new game, then save the last one...
    gameboy = new GameBoyCore(canvas, ROM);
    gameboy.openMBC = openSRAM;
    gameboy.openRTC = openRTC;
    gameboy.start();
    run();

    // 添加自动检测调用
    autoDetectGameRatio();

    // 设置分辨率检查
    setTimeout(checkResolutionChange, 1000);
}

function run() {
    if (GameBoyEmulatorInitialized()) {
        if (!GameBoyEmulatorPlaying()) {
            gameboy.stopEmulator &= 1;
            cout("Starting the iterator.", 0);
            var dateObj = new Date();
            gameboy.firstIteration = dateObj.getTime();
            gameboy.iterations = 0;
            gbRunInterval = setInterval(function () {
                if (!document.hidden && !document.msHidden && !document.mozHidden && !document.webkitHidden) {
                    gameboy.run();
                }
            }, settings[6]);
        }
        else {
            cout("The GameBoy core is already running.", 1);
        }
    }
    else {
        cout("GameBoy core cannot run while it has not been initialized.", 1);
    }
}

function pause() {
    if (GameBoyEmulatorInitialized()) {
        if (GameBoyEmulatorPlaying()) {
            autoSave();
            clearLastEmulation();
        }
        else {
            cout("GameBoy core has already been paused.", 1);
        }
    }
    else {
        cout("GameBoy core cannot be paused while it has not been initialized.", 1);
    }
}

function clearLastEmulation() {
    if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
        clearInterval(gbRunInterval);
        gameboy.stopEmulator |= 2;
        cout("The previous emulation has been cleared.", 0);
    }
    else {
        cout("No previous emulation was found to be cleared.", 0);
    }
}

function save() {
    if (GameBoyEmulatorInitialized()) {
        var state_suffix = 0;
        while (findValue("FREEZE_" + gameboy.name + "_" + state_suffix) != null) {
            state_suffix++;
        }
        saveState("FREEZE_" + gameboy.name + "_" + state_suffix);
    }
    else {
        cout("GameBoy core cannot be saved while it has not been initialized.", 1);
    }
}

function saveSRAM() {
    if (GameBoyEmulatorInitialized()) {
        if (gameboy.cBATT) {
            try {
                var sram = gameboy.saveSRAMState();
                if (sram.length > 0) {
                    cout("Saving the SRAM...", 0);
                    if (findValue("SRAM_" + gameboy.name) != null) {
                        //Remove the outdated storage format save:
                        cout("Deleting the old SRAM save due to outdated format.", 0);
                        deleteValue("SRAM_" + gameboy.name);
                    }
                    setValue("B64_SRAM_" + gameboy.name, arrayToBase64(sram));
                }
                else {
                    cout("SRAM could not be saved because it was empty.", 1);
                }
            }
            catch (error) {
                cout("Could not save the current emulation state(\"" + error.message + "\").", 2);
            }
        }
        else {
            cout("Cannot save a game that does not have battery backed SRAM specified.", 1);
        }
        saveRTC();
    }
    else {
        cout("GameBoy core cannot be saved while it has not been initialized.", 1);
    }
}

function saveRTC() {	//Execute this when SRAM is being saved as well.
    if (GameBoyEmulatorInitialized()) {
        if (gameboy.cTIMER) {
            try {
                cout("Saving the RTC...", 0);
                setValue("RTC_" + gameboy.name, gameboy.saveRTCState());
            }
            catch (error) {
                cout("Could not save the RTC of the current emulation state(\"" + error.message + "\").", 2);
            }
        }
    }
    else {
        cout("GameBoy core cannot be saved while it has not been initialized.", 1);
    }
}

function autoSave() {
    if (GameBoyEmulatorInitialized()) {
        cout("Automatically saving the SRAM.", 0);
        saveSRAM();
        saveRTC();
    }
}

function openSRAM(filename) {
    try {
        if (findValue("B64_SRAM_" + filename) != null) {
            cout("Found a previous SRAM state (Will attempt to load).", 0);
            return base64ToArray(findValue("B64_SRAM_" + filename));
        }
        else if (findValue("SRAM_" + filename) != null) {
            cout("Found a previous SRAM state (Will attempt to load).", 0);
            return findValue("SRAM_" + filename);
        }
        else {
            cout("Could not find any previous SRAM copy for the current ROM.", 0);
        }
    }
    catch (error) {
        cout("Could not open the  SRAM of the saved emulation state.", 2);
    }
    return [];
}

function openRTC(filename) {
    try {
        if (findValue("RTC_" + filename) != null) {
            cout("Found a previous RTC state (Will attempt to load).", 0);
            return findValue("RTC_" + filename);
        }
        else {
            cout("Could not find any previous RTC copy for the current ROM.", 0);
        }
    }
    catch (error) {
        cout("Could not open the RTC data of the saved emulation state.", 2);
    }
    return [];
}

function saveState(filename) {
    if (GameBoyEmulatorInitialized()) {
        try {
            setValue(filename, gameboy.saveState());
            cout("Saved the current state as: " + filename, 0);
        }
        catch (error) {
            cout("Could not save the current emulation state(\"" + error.message + "\").", 2);
        }
    }
    else {
        cout("GameBoy core cannot be saved while it has not been initialized.", 1);
    }
}

function openState(filename, canvas) {
    try {
        if (findValue(filename) != null) {
            try {
                clearLastEmulation();
                cout("Attempting to run a saved emulation state.", 0);
                gameboy = new GameBoyCore(canvas, "");
                gameboy.savedStateFileName = filename;
                gameboy.returnFromState(findValue(filename));
                run();

                // 重新检测游戏比例
                setTimeout(autoDetectGameRatio, 500);
            }
            catch (error) {
                alert(error.message + " file: " + error.fileName + " line: " + error.lineNumber);
            }
        }
        else {
            cout("Could not find the save state " + filename + "\".", 2);
        }
    }
    catch (error) {
        cout("Could not open the saved emulation state.", 2);
    }
}

function import_save(blobData) {
    blobData = decodeBlob(blobData);
    if (blobData && blobData.blobs) {
        if (blobData.blobs.length > 0) {
            for (var index = 0; index < blobData.blobs.length; ++index) {
                cout("Importing blob \"" + blobData.blobs[index].blobID + "\"", 0);
                if (blobData.blobs[index].blobContent) {
                    if (blobData.blobs[index].blobID.substring(0, 5) == "SRAM_") {
                        setValue("B64_" + blobData.blobs[index].blobID, base64(blobData.blobs[index].blobContent));
                    }
                    else {
                        setValue(blobData.blobs[index].blobID, JSON.parse(blobData.blobs[index].blobContent));
                    }
                }
                else if (blobData.blobs[index].blobID) {
                    cout("Save file imported had blob \"" + blobData.blobs[index].blobID + "\" with no blob data interpretable.", 2);
                }
                else {
                    cout("Blob chunk information missing completely.", 2);
                }
            }
        }
        else {
            cout("Could not decode the imported file.", 2);
        }
    }
    else {
        cout("Could not decode the imported file.", 2);
    }
}

function generateBlob(keyName, encodedData) {
    //Append the file format prefix:
    var saveString = "EMULATOR_DATA";
    var consoleID = "GameBoy";
    //Figure out the length:
    var totalLength = (saveString.length + 4 + (1 + consoleID.length)) + ((1 + keyName.length) + (4 + encodedData.length));
    //Append the total length in bytes:
    saveString += to_little_endian_dword(totalLength);
    //Append the console ID text's length:
    saveString += to_byte(consoleID.length);
    //Append the console ID text:
    saveString += consoleID;
    //Append the blob ID:
    saveString += to_byte(keyName.length);
    saveString += keyName;
    //Now append the save data:
    saveString += to_little_endian_dword(encodedData.length);
    saveString += encodedData;
    return saveString;
}

function generateMultiBlob(blobPairs) {
    var consoleID = "GameBoy";
    //Figure out the initial length:
    var totalLength = 13 + 4 + 1 + consoleID.length;
    //Append the console ID text's length:
    var saveString = to_byte(consoleID.length);
    //Append the console ID text:
    saveString += consoleID;
    var keyName = "";
    var encodedData = "";
    //Now append all the blobs:
    for (var index = 0; index < blobPairs.length; ++index) {
        keyName = blobPairs[index][0];
        encodedData = blobPairs[index][1];
        //Append the blob ID:
        saveString += to_byte(keyName.length);
        saveString += keyName;
        //Now append the save data:
        saveString += to_little_endian_dword(encodedData.length);
        saveString += encodedData;
        //Update the total length:
        totalLength += 1 + keyName.length + 4 + encodedData.length;
    }
    //Now add the prefix:
    saveString = "EMULATOR_DATA" + to_little_endian_dword(totalLength) + saveString;
    return saveString;
}

function decodeBlob(blobData) {
    /*Format is as follows:
        - 13 byte string "EMULATOR_DATA"
        - 4 byte total size (including these 4 bytes).
        - 1 byte Console type ID length
        - Console type ID text of 8 bit size
        blobs {
            - 1 byte blob ID length
            - blob ID text (Used to say what the data is (SRAM/freeze state/etc...))
            - 4 byte blob length
            - blob length of 32 bit size
        }
    */
    var length = blobData.length;
    var blobProperties = {};
    blobProperties.consoleID = null;
    var blobsCount = -1;
    blobProperties.blobs = [];
    if (length > 17) {
        if (blobData.substring(0, 13) == "EMULATOR_DATA") {
            var length = Math.min(((blobData.charCodeAt(16) & 0xFF) << 24) | ((blobData.charCodeAt(15) & 0xFF) << 16) | ((blobData.charCodeAt(14) & 0xFF) << 8) | (blobData.charCodeAt(13) & 0xFF), length);
            var consoleIDLength = blobData.charCodeAt(17) & 0xFF;
            if (length > 17 + consoleIDLength) {
                blobProperties.consoleID = blobData.substring(18, 18 + consoleIDLength);
                var blobIDLength = 0;
                var blobLength = 0;
                for (var index = 18 + consoleIDLength; index < length;) {
                    blobIDLength = blobData.charCodeAt(index++) & 0xFF;
                    if (index + blobIDLength < length) {
                        blobProperties.blobs[++blobsCount] = {};
                        blobProperties.blobs[blobsCount].blobID = blobData.substring(index, index + blobIDLength);
                        index += blobIDLength;
                        if (index + 4 < length) {
                            blobLength = ((blobData.charCodeAt(index + 3) & 0xFF) << 24) | ((blobData.charCodeAt(index + 2) & 0xFF) << 16) | ((blobData.charCodeAt(index + 1) & 0xFF) << 8) | (blobData.charCodeAt(index) & 0xFF);
                            index += 4;
                            if (index + blobLength <= length) {
                                blobProperties.blobs[blobsCount].blobContent =  blobData.substring(index, index + blobLength);
                                index += blobLength;
                            }
                            else {
                                cout("Blob length check failed, blob determined to be incomplete.", 2);
                                break;
                            }
                        }
                        else {
                            cout("Blob was incomplete, bailing out.", 2);
                            break;
                        }
                    }
                    else {
                        cout("Blob was incomplete, bailing out.", 2);
                        break;
                    }
                }
            }
        }
    }
    return blobProperties;
}

function matchKey(key) {	//Maps a keyboard key to a gameboy key.
    //Order: Right, Left, Up, Down, A, B, Select, Start
    var keymap = ["right", "left", "up", "down", "a", "b", "select", "start"];	//Keyboard button map.
    for (var index = 0; index < keymap.length; index++) {
        if (keymap[index] == key) {
            return index;
        }
    }
    return -1;
}

function GameBoyEmulatorInitialized() {
    return (typeof gameboy == "object" && gameboy != null);
}

function GameBoyEmulatorPlaying() {
    return ((gameboy.stopEmulator & 2) == 0);
}

function GameBoyKeyDown(key) {
    if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
        GameBoyJoyPadEvent(matchKey(key), true);
    }
}

function GameBoyJoyPadEvent(keycode, down) {
    if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
        if (keycode >= 0 && keycode < 8) {
            gameboy.JoyPadEvent(keycode, down);
        }
    }
}

function GameBoyKeyUp(key) {
    if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
        GameBoyJoyPadEvent(matchKey(key), false);
    }
}

function GameBoyGyroSignalHandler(e) {
    if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
        if (e.gamma || e.beta) {
            gameboy.GyroEvent(e.gamma * Math.PI / 180, e.beta * Math.PI / 180);
        }
        else {
            gameboy.GyroEvent(e.x, e.y);
        }
        try {
            e.preventDefault();
        }
        catch (error) { }
    }
}

//The emulator will call this to sort out the canvas properties for (re)initialization.
function initNewCanvas() {
    if (GameBoyEmulatorInitialized()) {
        gameboy.canvas.width = gameboy.canvas.clientWidth;
        gameboy.canvas.height = gameboy.canvas.clientHeight;
    }
}

//Call this when resizing the canvas:
function initNewCanvasSize() {
    if (GameBoyEmulatorInitialized()) {
        if (!settings[12]) {
            if (gameboy.onscreenWidth != 160 || gameboy.onscreenHeight != 144) {
                gameboy.initLCD();
            }
        }
        else {
            if (gameboy.onscreenWidth != gameboy.canvas.clientWidth || gameboy.onscreenHeight != gameboy.canvas.clientHeight) {
                gameboy.initLCD();
            }
        }
    }
}

// 页面加载完成后自动加载ROM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // 等待一小段时间确保其他脚本已加载
        setTimeout(function() {
            var canvas = document.getElementById("mainCanvas");
            if (canvas && typeof loadAutoROM === 'function') {
                // 如果页面没有自动调用，则手动调用
                if (!window.autoROMLoaded) {
                    loadAutoROM();
                    window.autoROMLoaded = true;
                }
            }
        }, 1000);
    });
} else {
    // 如果文档已经加载完成，直接执行
    setTimeout(function() {
        var canvas = document.getElementById("mainCanvas");
        if (canvas && typeof loadAutoROM === 'function') {
            if (!window.autoROMLoaded) {
                loadAutoROM();
                window.autoROMLoaded = true;
            }
        }
    }, 1000);
}

// 添加全局事件监听器，用于调试和测试
window.addEventListener('load', function() {
    console.log('GameBoyIO-Super Mario.js 已加载完成');
    console.log('自动加载路径: ' + AUTO_ROM_PATH);

    // 添加键盘快捷键用于手动触发比例检测（用于调试）
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            console.log('手动触发游戏比例检测');
            if (GameBoyEmulatorInitialized()) {
                autoDetectGameRatio();
            }
        }
    });
});