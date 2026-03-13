(function() {
    'use strict';

    const SALT = 'GinZarSalt';
    const SAVE_INTERVAL = 2000;
    const STORAGE_KEY = 'zgz_save';
    const GIFT_DURATION = 86400000; // 24 часа в миллисекундах

    // ========== ДАННЫЕ ПО УМОЛЧАНИЮ ==========
    const DEFAULT_PLAYER = {
        name: 'Gin Zar',
        avatar: '🧟',
        money: 1000,
        rainbowMoney: 0,
        weapons: [{ name: 'Нож кухонный', durability: -1 }],
        units: [],
        zombieKills: {
            'Зомби-страх': 0,
            'Зомби-силач': 0,
            'Зомби-хакер': 0,
            'Зомби-невидимка': 0,
            'Зомби-прыгун': 0,
            'Зомби-скелет': 0,
            'Big Zombie': 0,
            'Зомби-женщина': 0
        },
        maxWave: 0,
        usedPromos: [],
        promoBlockDonate: false,
        giftReceived: false,      // был ли получен подарок
        giftExpire: 0             // время истечения подарка (timestamp)
    };

    // ========== ИНИЦИАЛИЗАЦИЯ ХРАНИЛИЩА ==========
    let storage = (function() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('test', 'test');
                localStorage.removeItem('test');
                return localStorage;
            }
        } catch (e) {}
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('test', 'test');
                sessionStorage.removeItem('test');
                return sessionStorage;
            }
        } catch (e) {}
        const memory = {};
        return {
            getItem: (key) => memory[key] || null,
            setItem: (key, val) => { memory[key] = val; },
            removeItem: (key) => { delete memory[key]; }
        };
    })();

    let _player = JSON.parse(JSON.stringify(DEFAULT_PLAYER));

    // ========== ХЕШ-ФУНКЦИЯ ==========
    function _hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return (hash ^ 0xdeadbeef).toString(16);
    }

    // ========== СОХРАНЕНИЕ ==========
    function _save() {
        try {
            const dataStr = JSON.stringify({ 
                player: _player, 
                version: 2,  // увеличили версию для новых полей
                salt: SALT,
                timestamp: Date.now()
            });
            const hash = _hash(dataStr);
            const payload = JSON.stringify({ data: dataStr, hash: hash });
            const encoded = btoa(unescape(encodeURIComponent(payload)));
            storage.setItem(STORAGE_KEY, encoded);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ========== ЗАГРУЗКА ==========
    function _load() {
        try {
            const encoded = storage.getItem(STORAGE_KEY);
            if (!encoded) return false;
            
            const payload = decodeURIComponent(escape(atob(encoded)));
            const container = JSON.parse(payload);
            
            if (!container.data || !container.hash) return false;
            if (_hash(container.data) !== container.hash) return false;
            
            const parsed = JSON.parse(container.data);
            if (parsed.version < 1 || !parsed.player) return false;
            
            // Восстанавливаем игрока, дополняя новыми полями из DEFAULT_PLAYER
            _player = { ...DEFAULT_PLAYER, ...parsed.player };
            _player.zombieKills = { ...DEFAULT_PLAYER.zombieKills, ...parsed.player.zombieKills };
            _player.maxWave = parsed.player.maxWave || 0;
            _player.usedPromos = Array.isArray(parsed.player.usedPromos) ? parsed.player.usedPromos : [];
            _player.rainbowMoney = parsed.player.rainbowMoney || 0;
            _player.units = Array.isArray(parsed.player.units) ? parsed.player.units : [];
            _player.promoBlockDonate = parsed.player.promoBlockDonate || false;
            _player.avatar = parsed.player.avatar || DEFAULT_PLAYER.avatar;
            _player.giftReceived = parsed.player.giftReceived || false;
            _player.giftExpire = parsed.player.giftExpire || 0;
            
            // Обрабатываем оружие
            if (!Array.isArray(_player.weapons)) {
                _player.weapons = [];
            } else {
                _player.weapons = _player.weapons
                    .map(w => {
                        if (typeof w === 'string') return { name: w, durability: -1 };
                        if (w && typeof w === 'object' && w.name) {
                            return { 
                                name: w.name, 
                                durability: w.durability !== undefined ? w.durability : -1 
                            };
                        }
                        return null;
                    })
                    .filter(w => w !== null);
            }
            
            // Гарантируем наличие ножа
            if (!_player.weapons.some(w => w.name === 'Нож кухонный')) {
                _player.weapons.push({ name: 'Нож кухонный', durability: -1 });
            }

            // Проверяем подарок
            if (_player.giftReceived && _player.giftExpire < Date.now()) {
                // Подарок истёк, удаляем Конфетный меч из инвентаря
                _player.weapons = _player.weapons.filter(w => w.name !== 'Конфетный меч');
            } else if (_player.giftReceived && _player.giftExpire >= Date.now()) {
                // Подарок ещё действует, добавляем меч, если его нет
                if (!_player.weapons.some(w => w.name === 'Конфетный меч')) {
                    _player.weapons.push({ name: 'Конфетный меч', durability: -1 });
                }
            }
            
            return true;
        } catch (e) {
            return false;
        }
    }

    // ========== ЗАГРУЗКА ПРИ СТАРТЕ ==========
    if (!_load()) {
        _player = JSON.parse(JSON.stringify(DEFAULT_PLAYER));
        _save();
    }

    // ========== АВТОСОХРАНЕНИЕ ==========
    let saveTimer = setInterval(_save, SAVE_INTERVAL);
    window.addEventListener('beforeunload', () => {
        clearInterval(saveTimer);
        _save();
    });

    // ========== ПУБЛИЧНЫЙ API ==========
    const Game = {
        // Геттеры
        getMoney: () => _player.money,
        getRainbowMoney: () => _player.rainbowMoney,
        getWeapons: () => _player.weapons.map(w => ({ ...w })),
        getWeaponNames: () => _player.weapons.map(w => w.name),
        hasWeapon: (name) => _player.weapons.some(w => w.name === name),
        getWeapon: (name) => {
            const w = _player.weapons.find(w => w.name === name);
            return w ? { ...w } : null;
        },
        getUnits: () => _player.units.slice(),
        hasUnit: (name) => _player.units.includes(name),
        getName: () => _player.name,
        getAvatar: () => _player.avatar,
        getMaxWave: () => _player.maxWave,
        getUsedPromos: () => [..._player.usedPromos],
        isPromoUsed: (code) => _player.usedPromos.includes(code),
        isDonateBlocked: () => _player.promoBlockDonate,
        isGiftActive: () => _player.giftReceived && _player.giftExpire > Date.now(),
        getGiftTimeLeft: () => _player.giftExpire - Date.now(),

        // Сеттеры с проверками
        addMoney: (amount) => {
            if (typeof amount === 'number' && amount > 0) {
                _player.money += amount;
                _save();
                return true;
            }
            return false;
        },
        
        deductMoney: (amount) => {
            if (typeof amount === 'number' && amount > 0 && _player.money >= amount) {
                _player.money -= amount;
                _save();
                return true;
            }
            return false;
        },
        
        addRainbowMoney: (amount) => {
            if (typeof amount === 'number' && amount > 0) {
                _player.rainbowMoney += amount;
                _save();
                return true;
            }
            return false;
        },
        
        deductRainbowMoney: (amount) => {
            if (typeof amount === 'number' && amount > 0 && 
                _player.rainbowMoney >= amount && !_player.promoBlockDonate) {
                _player.rainbowMoney -= amount;
                _save();
                return true;
            }
            return false;
        },
        
        setMoney: (amount) => {
            if (typeof amount === 'number' && amount >= 0) {
                _player.money = amount;
                _save();
                return true;
            }
            return false;
        },
        
        setRainbowMoney: (amount) => {
            if (typeof amount === 'number' && amount >= 0) {
                _player.rainbowMoney = amount;
                _save();
                return true;
            }
            return false;
        },
        
        addWeapon: (weaponObj) => {
            if (!weaponObj || !weaponObj.name) return false;
            if (_player.weapons.some(w => w.name === weaponObj.name)) return false;
            
            _player.weapons.push({ 
                name: weaponObj.name, 
                durability: weaponObj.durability 
            });
            _save();
            return true;
        },
        
        updateWeaponDurability: (name, newDur) => {
            const weapon = _player.weapons.find(w => w.name === name);
            if (weapon) {
                weapon.durability = newDur;
                _save();
                return true;
            }
            return false;
        },
        
        removeWeapon: (name) => {
            const index = _player.weapons.findIndex(w => w.name === name);
            if (index !== -1) {
                _player.weapons.splice(index, 1);
                _save();
                return true;
            }
            return false;
        },
        
        addUnit: (unitName) => {
            if (!_player.units.includes(unitName)) {
                _player.units.push(unitName);
                _save();
                return true;
            }
            return false;
        },
        
        incrementZombieKill: (zombieName) => {
            if (_player.zombieKills.hasOwnProperty(zombieName)) {
                _player.zombieKills[zombieName] += 1;
                _save();
                return true;
            }
            return false;
        },
        
        setMaxWave: (wave) => {
            if (typeof wave === 'number' && wave > _player.maxWave) {
                _player.maxWave = wave;
                _save();
                return true;
            }
            return false;
        },
        
        addUsedPromo: (code) => {
            if (!_player.usedPromos.includes(code)) {
                _player.usedPromos.push(code);
                _save();
                return true;
            }
            return false;
        },
        
        setDonateBlock: (block) => {
            _player.promoBlockDonate = block;
            _save();
        },
        
        setName: (newName) => {
            if (typeof newName === 'string' && newName.trim().length > 0) {
                _player.name = newName.trim();
                _save();
                return true;
            }
            return false;
        },
        
        setAvatar: (avatar) => {
            if (typeof avatar === 'string') {
                _player.avatar = avatar;
                _save();
                return true;
            }
            return false;
        },
        
        // Подарок при первом входе
        claimGift: () => {
            if (!_player.giftReceived) {
                _player.giftReceived = true;
                _player.giftExpire = Date.now() + GIFT_DURATION;
                // Добавляем Конфетный меч
                if (!_player.weapons.some(w => w.name === 'Конфетный меч')) {
                    _player.weapons.push({ name: 'Конфетный меч', durability: -1 });
                }
                _save();
                return true;
            }
            return false;
        },
        
        reset: () => {
            _player = JSON.parse(JSON.stringify(DEFAULT_PLAYER));
            _save();
        },
        
        // Отладка
        debug: {
            getPlayer: () => ({ ..._player }),
            forceSave: _save,
            forceLoad: _load
        }
    };

    // ========== ЗАЩИТА ОТ ПОДМЕНЫ ==========
    Object.freeze(Game);
    window.Game = Game;

    // Проверка целостности каждую секунду
    setInterval(() => {
        if (window.Game !== Game) {
            console.warn('⚠️ Game object tampered, restoring...');
            window.Game = Game;
        }
    }, 1000);

    // Если подарок ещё не получен, выдаём при первой загрузке
    if (!_player.giftReceived) {
        Game.claimGift();
    }

    console.log('✅ Security module loaded successfully');
})();