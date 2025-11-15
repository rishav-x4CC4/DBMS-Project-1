// Game configuration
const config = {
    playerSpeed: 5,
    mouseSensitivity: 0.002,
    gravity: 9.8,
    jumpStrength: 5,
    enemySpawnRate: 3000, // milliseconds
    maxEnemies: 10
};

// Game state
let scene, camera, renderer;
let player;
let enemies = [];
let weapons = [];
let currentWeaponIndex = 0;
let isGameRunning = false;
let playerHealth = 100;
let score = 0;
let kills = 0;
let headshotCount = 0;
let bodyshotCount = 0;
let totalDamageDealt = 0;
let playerName = 'Player';
let playerAge = null;
let playerCountry = '';
let keys = {};
let mouseX = 0, mouseY = 0;
let canJump = true;
let enemySpawnTimer = 0;
let difficultyMultiplier = 1.0; // Starts at 100%, increases by 10% every 1000 score
let lastScoreCheckpoint = 0; // Track score increments of 1000
let baseSpawnRate = 3000; // Base spawn rate in milliseconds

// Weapon configurations
const weaponConfigs = [
    {
        name: 'Pistol',
        damage: 25,
        fireRate: 300, 
        ammo: 24,
        maxAmmo: 12,
        totalAmmo: 36,
        reloadTime: 600,
        range: 50
    },
    {
        name: 'Rifle',
        damage: 80,
        fireRate: 100,
        ammo: 30,
        maxAmmo: 30,
        totalAmmo: 90,
        reloadTime: 2000,
        range: 100
    },
    {
        name: 'Shotgun',
        damage: 60,
        fireRate: 800,
        ammo: 8,
        maxAmmo: 8,
        totalAmmo: 24,
        reloadTime: 2500,
        range: 30
    },
    {
        name: 'SMG',
        damage: 30,
        fireRate: 100,
        ammo: 800,
        maxAmmo: 40,
        totalAmmo: 9999,
        reloadTime: 200,
        range: 60
    }
];

let currentWeapon = { ...weaponConfigs[3] }; // Default to SMG
let lastShotTime = 0;
let isReloading = false;
let muzzleFlash = null;
let cameraRecoil = { x: 0, y: 0 };
let recoilDecay = 0.9;
let isMouseDown = false; // Track if mouse button is held down
let autoFireInterval = null; // Interval for automatic firing

// Initialize Three.js scene
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 0, 500);

    // Camera (FPS view)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 0); // Eye level

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(500, 500);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create walls/boundaries
    createWalls();

    // Create obstacles
    createObstacles();

    // Player (invisible, camera is the player)
    player = new THREE.Group();
    player.position.set(0, 0, 0);
    scene.add(player);

    // Create muzzle flash (will be positioned at camera) - 5mm dot
    const muzzleFlashGeometry = new THREE.SphereGeometry(0.005, 8, 8);
    const muzzleFlashMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00, 
        emissive: 0xffff00,
        transparent: true,
        opacity: 0.9
    });
    muzzleFlash = new THREE.Mesh(muzzleFlashGeometry, muzzleFlashMaterial);
    muzzleFlash.visible = false;
    scene.add(muzzleFlash);
}

function createWalls() {
    const wallHeight = 10;
    const wallLength = 100;
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });

    // Create walls around the play area
    const walls = [
        { pos: [0, wallHeight / 2, -wallLength / 2], rot: [0, 0, 0] },
        { pos: [0, wallHeight / 2, wallLength / 2], rot: [0, Math.PI, 0] },
        { pos: [-wallLength / 2, wallHeight / 2, 0], rot: [0, Math.PI / 2, 0] },
        { pos: [wallLength / 2, wallHeight / 2, 0], rot: [0, -Math.PI / 2, 0] }
    ];

    walls.forEach(wall => {
        const wallGeometry = new THREE.BoxGeometry(2, wallHeight, wallLength);
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(...wall.pos);
        wallMesh.rotation.y = wall.rot[1];
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);
    });
}

function createObstacles() {
    const obstacleMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
    
    // Create some obstacles/cover
    for (let i = 0; i < 15; i++) {
        const size = Math.random() * 3 + 1;
        const obstacle = new THREE.Mesh(
            new THREE.BoxGeometry(size, size * 2, size),
            obstacleMaterial
        );
        obstacle.position.set(
            (Math.random() - 0.5) * 80,
            size,
            (Math.random() - 0.5) * 80
        );
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
        scene.add(obstacle);
    }
}

// Enemy class - Zombie
class Enemy {
    constructor(position) {
        this.mesh = new THREE.Group();
        
        // Zombie body (torso) - slightly hunched
        const torsoGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.4);
        const zombieMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d3a });
        const torso = new THREE.Mesh(torsoGeometry, zombieMaterial);
        torso.position.y = 1.2;
        this.mesh.add(torso);

        // Head - zombie green, slightly deformed
        const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0x3d4a2d });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 2.1;
        head.rotation.x = 0.1; // Slight tilt
        this.head = head; // Store reference for headshot detection
        this.mesh.add(head);

        // Left arm
        const armGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
        const armMaterial = new THREE.MeshLambertMaterial({ color: 0x5a6d4a });
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.5, 1.2, 0);
        leftArm.rotation.z = 0.3;
        this.mesh.add(leftArm);

        // Right arm
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.5, 1.2, 0);
        rightArm.rotation.z = -0.3;
        this.mesh.add(rightArm);

        // Left leg
        const legGeometry = new THREE.BoxGeometry(0.3, 0.9, 0.3);
        const legMaterial = new THREE.MeshLambertMaterial({ color: 0x4a5d3a });
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.2, 0.45, 0);
        this.mesh.add(leftLeg);

        // Right leg
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.2, 0.45, 0);
        this.mesh.add(rightLeg);

        // Eyes (glowing red)
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, emissive: 0xff0000 });
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 2.15, 0.26);
        this.mesh.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 2.15, 0.26);
        this.mesh.add(rightEye);

        // Add some texture detail with darker patches
        const patchMaterial = new THREE.MeshLambertMaterial({ color: 0x2d3a1d });
        for (let i = 0; i < 3; i++) {
            const patch = new THREE.Mesh(
                new THREE.CircleGeometry(0.1, 8),
                patchMaterial
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(
                (Math.random() - 0.5) * 0.4,
                Math.random() * 1.5 + 0.5,
                (Math.random() - 0.5) * 0.3
            );
            this.mesh.add(patch);
        }

        this.mesh.position.set(...position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        this.health = 100;
        this.baseSpeed = 0.02; // Base speed before difficulty scaling
        this.speed = this.baseSpeed * difficultyMultiplier; // Apply difficulty scaling
        this.lastShotTime = 0;
        this.shootCooldown = 2000; // milliseconds
        this.detectionRange = 30; // Detection range (how far they can see player)
        this.shootRange = 2.5; // Attack range - very close (melee range)
        this.wobble = 0; // For zombie animation
    }

    update() {
        if (!isGameRunning) return;

        const dx = camera.position.x - this.mesh.position.x;
        const dz = camera.position.z - this.mesh.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Zombie wobble animation
        this.wobble += 0.1;
        
        // Face player
        const lookAtTarget = new THREE.Vector3(camera.position.x, this.mesh.position.y, camera.position.z);
        this.mesh.lookAt(lookAtTarget);
        
        // Add wobble to existing rotation
        this.mesh.rotation.z += Math.sin(this.wobble) * 0.02;
        this.mesh.rotation.x += Math.cos(this.wobble * 0.7) * 0.01;

        // AI behavior
        if (distance < this.detectionRange) {
            // Move towards player (zombie shuffle) - they need to get close
            if (distance > 2) {
                const moveSpeed = this.speed * (0.8 + Math.sin(this.wobble * 2) * 0.2);
                this.mesh.position.x += (dx / distance) * moveSpeed;
                this.mesh.position.z += (dz / distance) * moveSpeed;
            }

            // Attack player only when very close (melee range)
            if (distance < this.shootRange && Date.now() - this.lastShotTime > this.shootCooldown) {
                this.shoot();
                this.lastShotTime = Date.now();
            }
        }
    }

    shoot() {
        const dx = camera.position.x - this.mesh.position.x;
        const dz = camera.position.z - this.mesh.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        // Only attack when very close (melee range)
        if (distance < this.shootRange) {
            takeDamage(10);
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        scene.remove(this.mesh);
        const index = enemies.indexOf(this);
        if (index > -1) {
            enemies.splice(index, 1);
        }
        kills++;
        score += 100;
        checkDifficultyIncrease();
        updateHUD();
    }
}

// Spawn enemy
function spawnEnemy() {
    if (enemies.length >= config.maxEnemies) return;

    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 20;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    const enemy = new Enemy([x, 0, z]);
    enemies.push(enemy);
}

// Weapon switching
function switchWeapon(index) {
    if (isReloading) return;
    
    // Stop automatic fire when switching weapons
    if (autoFireInterval) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
        isMouseDown = false;
    }
    
    currentWeaponIndex = index;
    currentWeapon = { ...weaponConfigs[index] };
    updateHUD();
}

// Shooting
function shoot() {
    if (!isGameRunning || isReloading) return;
    if (currentWeapon.ammo <= 0) {
        // Stop automatic fire when out of ammo
        if (autoFireInterval) {
            clearInterval(autoFireInterval);
            autoFireInterval = null;
            isMouseDown = false;
        }
        if (currentWeapon.totalAmmo > 0) {
            reload();
        }
        return;
    }
    if (Date.now() - lastShotTime < currentWeapon.fireRate) return;

    currentWeapon.ammo--;
    lastShotTime = Date.now();
    updateHUD();

    // Shooting animation - muzzle flash
    if (muzzleFlash) {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(camera.quaternion);
        muzzleFlash.position.copy(camera.position);
        muzzleFlash.position.add(direction.multiplyScalar(0.3));
        muzzleFlash.visible = true;
        muzzleFlash.scale.set(1, 1, 1);
        
        // Fade out muzzle flash
        setTimeout(() => {
            if (muzzleFlash) {
                muzzleFlash.visible = false;
            }
        }, 50);
    }

    // Camera recoil animation
    const recoilIntensity = currentWeapon.name === 'Shotgun' ? 0.05 : (currentWeapon.name === 'SMG' ? 0.02 : 0.03);
    cameraRecoil.x = (Math.random() - 0.5) * recoilIntensity;
    cameraRecoil.y = Math.random() * recoilIntensity * 0.5 + 0.01;
    
    // Apply recoil to camera rotation
    camera.rotation.x -= cameraRecoil.y;
    camera.rotation.y -= cameraRecoil.x;

    // Raycasting for hit detection
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Get all enemy meshes
    const enemyMeshes = enemies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(enemyMeshes, true);

    // Calculate damage with difficulty scaling
    const baseDamage = currentWeapon.damage;
    const scaledDamage = baseDamage * difficultyMultiplier;

    for (let i = 0; i < intersects.length; i++) {
        const intersect = intersects[i];
        // Find the enemy that owns this mesh
        const enemy = enemies.find(e => {
            return e.mesh === intersect.object || 
                   e.mesh === intersect.object.parent ||
                   e.mesh.children.includes(intersect.object) ||
                   e.mesh.getObjectById(intersect.object.id);
        });
        
        if (enemy) {
            // Check if it's a headshot
            // Head is at y position 2.1, so check if the hit object is the head or something near that height
            const hitY = intersect.point.y;
            const enemyY = enemy.mesh.position.y;
            const relativeY = hitY - enemyY;
            
            // Headshot if hit is above 1.8 (head area) or if it's the head mesh itself
            const isHeadshot = intersect.object === enemy.head ||
                             (enemy.head && (enemy.head === intersect.object || enemy.head.children.includes(intersect.object))) ||
                             relativeY > 1.8;
            
            // Headshots do 3x damage, body shots do normal damage
            const damage = isHeadshot ? scaledDamage * 3 : scaledDamage;
            if (isHeadshot) {
                headshotCount++;
            } else {
                bodyshotCount++;
            }
            totalDamageDealt += Math.floor(damage);
            enemy.takeDamage(damage);
            break;
        }
    }
}

// Reloading
function reload() {
    if (isReloading || currentWeapon.ammo === currentWeapon.maxAmmo || currentWeapon.totalAmmo === 0) return;

    // Stop automatic fire when reloading
    if (autoFireInterval) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
        isMouseDown = false;
    }

    isReloading = true;
    setTimeout(() => {
        const needed = currentWeapon.maxAmmo - currentWeapon.ammo;
        const reloadAmount = Math.min(needed, currentWeapon.totalAmmo);
        currentWeapon.ammo += reloadAmount;
        currentWeapon.totalAmmo -= reloadAmount;
        isReloading = false;
        updateHUD();
    }, currentWeapon.reloadTime);
}

// Player damage
function takeDamage(amount) {
    playerHealth -= amount;
    if (playerHealth <= 0) {
        playerHealth = 0;
        gameOver();
    }
    updateHUD();
}

// Check and increase difficulty every 1000 score
function checkDifficultyIncrease() {
    const currentCheckpoint = Math.floor(score / 1000);
    
    if (currentCheckpoint > lastScoreCheckpoint) {
        // Increase difficulty by 10%
        difficultyMultiplier += 0.10;
        lastScoreCheckpoint = currentCheckpoint;
        
        // Update all existing enemies' speed
        enemies.forEach(enemy => {
            enemy.speed = enemy.baseSpeed * difficultyMultiplier;
        });
        
        console.log(`Difficulty increased! Multiplier: ${(difficultyMultiplier * 100).toFixed(0)}%`);
    }
}

// Get current spawn rate based on difficulty (faster spawn = lower time)
function getCurrentSpawnRate() {
    // Spawn rate decreases as difficulty increases (inverse relationship)
    // At 100% difficulty: 3000ms, at 200% difficulty: 1500ms, etc.
    return baseSpawnRate / difficultyMultiplier;
}

// Update HUD
function updateHUD() {
    document.getElementById('healthText').textContent = Math.max(0, Math.floor(playerHealth));
    document.getElementById('healthFill').style.width = playerHealth + '%';
    document.getElementById('ammoCurrent').textContent = currentWeapon.ammo;
    // Show "9999+" for SMG when ammo is very high
    const ammoDisplay = currentWeapon.totalAmmo >= 9999 ? '9999+' : currentWeapon.totalAmmo;
    document.getElementById('ammoTotal').textContent = ammoDisplay;
    document.getElementById('score').textContent = score;
    document.getElementById('kills').textContent = kills;
    document.getElementById('weaponName').textContent = currentWeapon.name + (isReloading ? ' (Reloading...)' : '');
}

// Player movement
function updatePlayerMovement() {
    if (!isGameRunning) return;

    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    forward.applyQuaternion(camera.quaternion);
    right.applyQuaternion(camera.quaternion);

    if (keys['w'] || keys['W']) direction.add(forward);
    if (keys['s'] || keys['S']) direction.sub(forward);
    if (keys['a'] || keys['A']) direction.sub(right);
    if (keys['d'] || keys['D']) direction.add(right);

    direction.normalize();
    direction.multiplyScalar(config.playerSpeed * 0.1);

    camera.position.add(direction);
    camera.position.y = 1.6; // Keep at eye level

    // Boundary checking
    const boundary = 45;
    camera.position.x = Math.max(-boundary, Math.min(boundary, camera.position.x));
    camera.position.z = Math.max(-boundary, Math.min(boundary, camera.position.z));
}

// Mouse look
function onMouseMove(event) {
    if (!isGameRunning) return;

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    mouseX -= movementX * config.mouseSensitivity;
    mouseY -= movementY * config.mouseSensitivity;
    mouseY = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseY));

    camera.rotation.order = 'YXZ';
    camera.rotation.y = mouseX;
    camera.rotation.x = mouseY;
    
    // Apply recoil decay
    cameraRecoil.x *= recoilDecay;
    cameraRecoil.y *= recoilDecay;
    
    // Apply remaining recoil
    if (Math.abs(cameraRecoil.x) > 0.001 || Math.abs(cameraRecoil.y) > 0.001) {
        camera.rotation.y -= cameraRecoil.x * 0.1;
        camera.rotation.x -= cameraRecoil.y * 0.1;
    }
}

// Game loop
function animate() {
    requestAnimationFrame(animate);

    if (isGameRunning) {
        updatePlayerMovement();

        // Update enemies
        enemies.forEach(enemy => enemy.update());

        // Spawn enemies (spawn rate increases with difficulty)
        enemySpawnTimer += 16; // ~60fps
        const currentSpawnRate = getCurrentSpawnRate();
        if (enemySpawnTimer >= currentSpawnRate) {
            spawnEnemy();
            enemySpawnTimer = 0;
        }
    }

    renderer.render(scene, camera);
}

// Game over
async function gameOver() {
    isGameRunning = false;
    
    // Stop automatic fire
    if (autoFireInterval) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
        isMouseDown = false;
    }
    
    document.getElementById('showScoreboard').style.display = 'none';
    
    // Save score
    try {
        const totalShots = headshotCount + bodyshotCount;
        const calculatedAccuracy = totalShots > 0 ? parseFloat(((headshotCount / totalShots) * 100).toFixed(2)) : null;

        await fetch('/api/scores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerName,
                age: playerAge,
                country: playerCountry,
                score,
                kills,
                deaths: 1,
                accuracy: calculatedAccuracy,
                rank: null,
                matchDate: new Date().toISOString(),
                mapName: 'Training Grounds'
            })
        });
    } catch (error) {
        console.error('Error saving score:', error);
    }

    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalKills').textContent = kills;
    document.getElementById('gameOverScreen').style.display = 'block';
}

// Start game
function startGame() {
    const nameInput = document.getElementById('playerName').value.trim();
    const ageInput = document.getElementById('playerAge').value.trim();
    const countryInput = document.getElementById('playerCountry').value.trim();

    if (!nameInput) {
        alert('Please enter your name to start.');
        return;
    }

    const parsedAge = ageInput ? parseInt(ageInput, 10) : NaN;
    if (!ageInput || Number.isNaN(parsedAge) || parsedAge <= 0) {
        alert('Please enter a valid age.');
        return;
    }

    if (!countryInput) {
        alert('Please enter your country.');
        return;
    }

    playerName = nameInput;
    playerAge = parsedAge;
    playerCountry = countryInput;

    document.getElementById('startScreen').style.display = 'none';
    
    // Reset game state
    playerHealth = 100;
    score = 0;
    kills = 0;
    headshotCount = 0;
    bodyshotCount = 0;
    totalDamageDealt = 0;
    enemies = [];
    currentWeapon = { ...weaponConfigs[3] }; // Start with SMG
    currentWeaponIndex = 3;
    difficultyMultiplier = 1.0; // Reset difficulty
    lastScoreCheckpoint = 0; // Reset checkpoint
    camera.position.set(0, 1.6, 0);
    mouseX = 0;
    mouseY = 0;
    enemySpawnTimer = 0;
    
    // Stop automatic fire if active
    if (autoFireInterval) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
        isMouseDown = false;
    }

    // Clear existing enemies
    enemies.forEach(enemy => {
        scene.remove(enemy.mesh);
    });
    enemies = [];

    isGameRunning = true;
    updateHUD();
    document.getElementById('showScoreboard').style.display = 'block';
    
    // Spawn initial enemies
    for (let i = 0; i < 3; i++) {
        setTimeout(() => spawnEnemy(), i * 1000);
    }
}

// Event listeners
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    if (e.key === 'r' || e.key === 'R') {
        reload();
    }
    
    if (e.key === '1') switchWeapon(0); // Pistol
    if (e.key === '2') switchWeapon(1); // Rifle
    if (e.key === '3') switchWeapon(2); // Shotgun
    if (e.key === '4') switchWeapon(3); // SMG
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

document.addEventListener('mousemove', onMouseMove);

// Mouse down - start shooting (automatic for SMG, single shot for others)
document.addEventListener('mousedown', (e) => {
    if (isGameRunning && e.button === 0) {
        isMouseDown = true;
        
        // For SMG, start automatic fire
        if (currentWeapon.name === 'SMG') {
            // Fire immediately
            shoot();
            // Then continue firing at fire rate interval
            autoFireInterval = setInterval(() => {
                if (isMouseDown && isGameRunning && !isReloading && currentWeapon.ammo > 0) {
                    shoot();
                } else if (!isMouseDown || currentWeapon.ammo <= 0) {
                    clearInterval(autoFireInterval);
                    autoFireInterval = null;
                }
            }, currentWeapon.fireRate);
        } else {
            // Single shot for other weapons
            shoot();
        }
    }
});

// Mouse up - stop automatic firing
document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        isMouseDown = false;
        if (autoFireInterval) {
            clearInterval(autoFireInterval);
            autoFireInterval = null;
        }
    }
});

// Also handle click for compatibility (single shot for non-SMG weapons)
document.addEventListener('click', (e) => {
    if (isGameRunning && e.button === 0 && currentWeapon.name !== 'SMG') {
        shoot();
    }
});

// Load scoreboard
async function loadScoreboard() {
    try {
        const response = await fetch('/api/scores');
        const scores = await response.json();
        
        const scoreboardList = document.getElementById('scoreboardList');
        scoreboardList.innerHTML = '';
        
        if (scores.length === 0) {
            scoreboardList.innerHTML = '<p style="text-align: center; color: #999;">No scores yet</p>';
            return;
        }
        
        scores.forEach((score, index) => {
            const entry = document.createElement('div');
            entry.className = 'score-entry';
            const name = score.playerName ?? score.player_name ?? 'Unknown';
            const value = score.score ?? score.Score ?? 0;
            entry.innerHTML = `
                <span class="rank">#${index + 1}</span>
                <span class="name">${name}</span>
                <span class="score-value">${value}</span>
            `;
            scoreboardList.appendChild(entry);
        });
    } catch (error) {
        console.error('Error loading scoreboard:', error);
    }
}

// Load leaderboard (aggregated per player)
async function loadLeaderboard() {
    try {
        const response = await fetch('/api/leaderboard');
        const rows = await response.json();

        const list = document.getElementById('scoreboardList');
        list.innerHTML = '';

        if (rows.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: #999;">No data yet</p>';
            return;
        }

        // Header row
        const header = document.createElement('div');
        header.className = 'score-entry';
        header.innerHTML = `
            <span class="rank">#</span>
            <span class="name">Player</span>
            <span class="score-value">Best</span>
            <span class="games">Games</span>
            <span class="hs">Avg%</span>
            <span class="bs">Rank</span>
            <span class="kills">Kills</span>
            <span class="dmg">Deaths</span>
        `;
        list.appendChild(header);

        rows.forEach((r, idx) => {
            const entry = document.createElement('div');
            entry.className = 'score-entry';
            const name = r.playerName ?? r.player_name ?? 'Unknown';
            const bestScore = r.bestScore ?? r.best_score ?? 0;
            const gamesPlayed = r.gamesPlayed ?? r.games_played ?? 0;
            const averageAccuracy = r.averageAccuracy ?? r.average_accuracy;
            const bestRank = r.bestRank ?? r.best_rank;
            const totalKills = r.totalKills ?? r.total_kills ?? 0;
            const totalDeaths = r.totalDeaths ?? r.total_deaths ?? 0;
            const formattedAccuracy = averageAccuracy !== null && averageAccuracy !== undefined
                ? `${Number(averageAccuracy).toFixed(2)}%`
                : 'N/A';
            const formattedRank = bestRank !== null && bestRank !== undefined ? bestRank : 'N/A';
            entry.innerHTML = `
                <span class="rank">#${idx + 1}</span>
                <span class="name">${name}</span>
                <span class="score-value">${bestScore}</span>
                <span class="games">${gamesPlayed}</span>
                <span class="hs">${formattedAccuracy}</span>
                <span class="bs">${formattedRank}</span>
                <span class="kills">${totalKills}</span>
                <span class="dmg">${totalDeaths}</span>
            `;
            list.appendChild(entry);
        });
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

// Show/hide scoreboard
function displayScoreboard() {
    document.getElementById('scoreboard').style.display = 'block';
    loadScoreboard();
}

function hideScoreboard() {
    document.getElementById('scoreboard').style.display = 'none';
}

document.getElementById('startButton').addEventListener('click', startGame);
document.getElementById('restartButton').addEventListener('click', () => {
    document.getElementById('gameOverScreen').style.display = 'none';
    startGame();
});

document.getElementById('showScoreboard').addEventListener('click', displayScoreboard);
document.getElementById('closeScoreboard').addEventListener('click', hideScoreboard);
document.getElementById('toggleLeaderboard').addEventListener('click', () => {
    document.getElementById('scoreboardTitle').textContent = 'Leaderboard';
    loadLeaderboard();
});
document.getElementById('toggleTopScores').addEventListener('click', () => {
    document.getElementById('scoreboardTitle').textContent = 'Top Scores';
    loadScoreboard();
});

// Lock pointer on click
document.addEventListener('click', () => {
    if (isGameRunning) {
        document.body.requestPointerLock();
    }
});

// Initialize
window.addEventListener('load', () => {
    initScene();
    animate();
    updateHUD();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

