import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const sceneWrap = document.getElementById("scene-wrap");
const statusEl = document.getElementById("status");
const crosshairEl = document.getElementById("crosshair");
const statOpenEl = document.getElementById("stat-open");
const statCashEl = document.getElementById("stat-cash");
const statStockEl = document.getElementById("stat-stock");
const statCustomersEl = document.getElementById("stat-customers");
const statSalesEl = document.getElementById("stat-sales");
const regPanelEl = document.getElementById("regulator-panel");
const regCashEl = document.getElementById("reg-cash");
const regStockEl = document.getElementById("reg-stock");
const regCustomersEl = document.getElementById("reg-customers");
const regSpawnEl = document.getElementById("reg-spawn");
const regPriceEl = document.getElementById("reg-price");

const PLACEABLE_TYPES = ["shelf", "freezer", "storage", "terminal", "cart", "goodsBox"];
const GRID_SIZE = 1;
const LAYOUT_KEY = "mini-supermarket-layout-v3";
const PLAYER_HEIGHT = 1.7;
const MAX_X = 19;
const MAX_Z = 13;

let currentPlaceType = null;
let selectedObject = null;
let isFirstPerson = true;
const placeButtons = Array.from(document.querySelectorAll("button[data-place]"));
const placeableRootObjects = [];
const customers = [];

const movement = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

const state = {
  isOpen: false,
  cash: 100,
  storageStock: 28,
  soldCount: 0,
  spawnTimer: 0,
  spawnInterval: 4.5,
  salePrice: 8
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20283c);

const camera = new THREE.PerspectiveCamera(
  60,
  sceneWrap.clientWidth / sceneWrap.clientHeight,
  0.1,
  300
);
camera.position.set(0, PLAYER_HEIGHT, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(sceneWrap.clientWidth, sceneWrap.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
sceneWrap.appendChild(renderer.domElement);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(0, 0, 0);
orbitControls.enableDamping = true;
orbitControls.maxPolarAngle = Math.PI * 0.49;
orbitControls.minDistance = 6;
orbitControls.maxDistance = 50;

const fpControls = new PointerLockControls(camera, renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.74);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(12, 20, 8);
scene.add(dirLight);

const floorGeo = new THREE.PlaneGeometry(40, 28, 1, 1);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x6d737c });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI * 0.5;
floor.name = "floor";
scene.add(floor);

const floorGrid = new THREE.GridHelper(40, 40, 0x545d6f, 0x3f4654);
floorGrid.position.y = 0.01;
scene.add(floorGrid);

createWalls();
seedStarterLayout();
refillAllShelves(false);
applyCameraMode(true);
updateStats();
syncRegulatorInputs();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();

renderer.domElement.addEventListener("pointerdown", onPointerDown);
renderer.domElement.addEventListener("click", onSceneClick);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("resize", onResize);

placeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-place");
    setCurrentPlaceType(type);
  });
});

document.getElementById("add-goods").addEventListener("click", addGoodsToSelectedShelf);
document.getElementById("spawn-goods").addEventListener("click", () => setCurrentPlaceType("goodsBox"));
document.getElementById("save-layout").addEventListener("click", saveLayout);
document.getElementById("load-layout").addEventListener("click", loadLayout);
document.getElementById("reset-layout").addEventListener("click", () => {
  clearAllPlaced();
  clearCustomers();
  resetBusiness();
  seedStarterLayout();
  refillAllShelves(false);
  setStatus("已重置为初始布局。");
});
document.getElementById("toggle-open").addEventListener("click", toggleOpen);
document.getElementById("restock-all").addEventListener("click", () => refillAllShelves(true));
document.getElementById("toggle-camera").addEventListener("click", () => applyCameraMode(!isFirstPerson));
document.getElementById("open-regulator").addEventListener("click", () => {
  regPanelEl.classList.toggle("hidden");
  syncRegulatorInputs();
});
document.getElementById("apply-regulator").addEventListener("click", applyRegulatorValues);
document.getElementById("spawn-one-customer").addEventListener("click", () => {
  createCustomer();
  updateStats();
  syncRegulatorInputs();
});
document.getElementById("clear-customers").addEventListener("click", () => {
  clearCustomers();
  syncRegulatorInputs();
  setStatus("已清空全部顾客。");
});

fpControls.addEventListener("lock", () => {
  setStatus("第一人称已锁定，WASD移动，Esc释放。");
});
fpControls.addEventListener("unlock", () => {
  if (isFirstPerson) {
    setStatus("第一人称已释放，点击场景可继续操作。");
  }
});

exposeSimulationApi();
animate();
setStatus("场景已加载。默认第一人称店长视角，点击场景后可行走。");

function createWalls() {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xbec5d3 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 0.4), wallMat);
  backWall.position.set(0, 2.5, -14);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 28), wallMat);
  leftWall.position.set(-20, 2.5, 0);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 28), wallMat);
  rightWall.position.set(20, 2.5, 0);
  scene.add(rightWall);

  const door = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 0.2), mat(0x7e8aa3));
  door.position.set(0, 1.6, 13.8);
  scene.add(door);
}

function onResize() {
  camera.aspect = sceneWrap.clientWidth / sceneWrap.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(sceneWrap.clientWidth, sceneWrap.clientHeight);
}

function onSceneClick() {
  if (isFirstPerson && !fpControls.isLocked) {
    fpControls.lock();
  }
}

function applyCameraMode(nextFirstPerson) {
  isFirstPerson = nextFirstPerson;
  const toggleBtn = document.getElementById("toggle-camera");

  if (isFirstPerson) {
    orbitControls.enabled = false;
    camera.position.set(0, PLAYER_HEIGHT, 11);
    crosshairEl.style.display = "block";
    toggleBtn.textContent = "切换到俯视相机";
    setStatus("第一人称模式：点击场景锁定鼠标，WASD移动。");
  } else {
    if (fpControls.isLocked) {
      fpControls.unlock();
    }
    orbitControls.enabled = true;
    camera.position.set(18, 14, 18);
    orbitControls.target.set(0, 0, 0);
    orbitControls.update();
    crosshairEl.style.display = "none";
    toggleBtn.textContent = "切换到第一人称";
    setStatus("俯视模式：可自由观察和布局编辑。");
  }
}

function setCurrentPlaceType(type) {
  currentPlaceType = PLACEABLE_TYPES.includes(type) ? type : null;
  placeButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.place === currentPlaceType));
  if (type === "goodsBox") {
    placeButtons.forEach((btn) => btn.classList.remove("active"));
  }
  setStatus(currentPlaceType ? `放置模式: ${currentPlaceType}` : "已退出放置模式");
}

function onPointerDown(event) {
  if (isFirstPerson && !fpControls.isLocked) {
    return;
  }

  prepareRay(event);

  if (currentPlaceType) {
    const floorHit = raycaster.intersectObject(floor, false)[0];
    if (floorHit) {
      const pos = snapToGrid(floorHit.point);
      const object = createUnit(currentPlaceType);
      object.position.copy(pos);
      scene.add(object);
      placeableRootObjects.push(object);
      selectObject(object);
      setStatus(`已放置: ${currentPlaceType} (${pos.x.toFixed(0)}, ${pos.z.toFixed(0)})`);
    }
    return;
  }

  const intersections = raycaster.intersectObjects(placeableRootObjects, true);
  if (!intersections.length) {
    selectObject(null);
    return;
  }
  const selected = findRootPlaceable(intersections[0].object);
  selectObject(selected);
}

function prepareRay(event) {
  if (isFirstPerson) {
    pointer.set(0, 0);
  } else {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }
  raycaster.setFromCamera(pointer, camera);
}

function selectObject(object) {
  if (selectedObject === object) {
    return;
  }
  highlightObject(selectedObject, false);
  selectedObject = object;
  highlightObject(selectedObject, true);
  if (!selectedObject) {
    setStatus("未选中设施。");
    return;
  }
  setStatus(`已选中: ${selectedObject.userData.type}`);
}

function highlightObject(root, active) {
  if (!root) {
    return;
  }
  root.traverse((child) => {
    if (!child.isMesh || !child.material || !child.material.color) {
      return;
    }
    if (!child.userData.baseColor) {
      child.userData.baseColor = child.material.color.getHex();
    }
    child.material.color.setHex(active ? 0x8dc3ff : child.userData.baseColor);
  });
}

function onKeyDown(event) {
  if (event.code === "KeyW") movement.forward = true;
  if (event.code === "KeyS") movement.backward = true;
  if (event.code === "KeyA") movement.left = true;
  if (event.code === "KeyD") movement.right = true;

  if (event.code === "KeyF") {
    addGoodsToSelectedShelf();
    return;
  }

  if (!selectedObject) {
    return;
  }

  if (event.key === "Delete") {
    if (selectedObject.userData.type === "terminal" && state.isOpen) {
      setStatus("营业中不可删除前台终端。");
      return;
    }
    removeObject(selectedObject);
    selectedObject = null;
    setStatus("已删除选中设施。");
    return;
  }

  if (event.key.toLowerCase() === "r") {
    selectedObject.rotation.y += Math.PI * 0.5;
    setStatus("已旋转 90°。");
    return;
  }

  let moved = false;
  switch (event.key) {
    case "ArrowUp":
      selectedObject.position.z -= GRID_SIZE;
      moved = true;
      break;
    case "ArrowDown":
      selectedObject.position.z += GRID_SIZE;
      moved = true;
      break;
    case "ArrowLeft":
      selectedObject.position.x -= GRID_SIZE;
      moved = true;
      break;
    case "ArrowRight":
      selectedObject.position.x += GRID_SIZE;
      moved = true;
      break;
    default:
      break;
  }
  if (moved) {
    selectedObject.position.copy(snapToGrid(selectedObject.position));
    setStatus(`已移动到 (${selectedObject.position.x.toFixed(0)}, ${selectedObject.position.z.toFixed(0)})`);
  }
}

function onKeyUp(event) {
  if (event.code === "KeyW") movement.forward = false;
  if (event.code === "KeyS") movement.backward = false;
  if (event.code === "KeyA") movement.left = false;
  if (event.code === "KeyD") movement.right = false;
}

function createUnit(type) {
  const group = new THREE.Group();
  group.userData.type = type;
  group.userData.id = `${type}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  if (type === "shelf") {
    const frameColor = 0x8b6b48;
    const legGeo = new THREE.BoxGeometry(0.12, 2.2, 0.12);
    const shelfGeo = new THREE.BoxGeometry(2.4, 0.1, 0.9);
    addLegs(group, legGeo, frameColor, 2.15, 0.75, 0.35);
    [0.35, 1.05, 1.75].forEach((y) => {
      const board = new THREE.Mesh(shelfGeo, mat(frameColor));
      board.position.set(0, y, 0);
      group.add(board);
    });
    group.userData.goodsSlots = [
      [-0.7, 0.48, -0.15], [0, 0.48, -0.15], [0.7, 0.48, -0.15],
      [-0.7, 1.18, -0.15], [0, 1.18, -0.15], [0.7, 1.18, -0.15],
      [-0.7, 1.88, -0.15], [0, 1.88, -0.15], [0.7, 1.88, -0.15]
    ];
    group.userData.goodsCount = 0;
  } else if (type === "freezer") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.1), mat(0xdfe5ef));
    body.position.set(0, 0.65, 0);
    const topGlass = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.07, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x9ac8ff, transparent: true, opacity: 0.45 })
    );
    topGlass.position.set(0, 1.24, 0);
    group.add(body, topGlass);
  } else if (type === "storage") {
    const frameColor = 0x546079;
    const legGeo = new THREE.BoxGeometry(0.12, 2.3, 0.12);
    const shelfGeo = new THREE.BoxGeometry(2.8, 0.1, 1.0);
    addLegs(group, legGeo, frameColor, 2.25, 0.9, 0.45);
    [0.45, 1.2, 1.95].forEach((y) => {
      const board = new THREE.Mesh(shelfGeo, mat(0x73829f));
      board.position.set(0, y, 0);
      group.add(board);
    });
  } else if (type === "terminal") {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.9), mat(0x39607a));
    desk.position.set(0, 0.5, 0);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.08), mat(0x111522));
    monitor.position.set(0.4, 1.25, -0.05);
    const scanner = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.25), mat(0x202a3f));
    scanner.position.set(-0.3, 1.02, 0.05);
    group.add(desk, monitor, scanner);
  } else if (type === "cart") {
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.8), mat(0x4f647f));
    basket.position.set(0, 0.7, 0);
    const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.07), mat(0x2e3749));
    pushBar.position.set(0, 1.12, -0.33);
    group.add(basket, pushBar);
    [-0.45, 0.45].forEach((x) => {
      [-0.3, 0.3].forEach((z) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), mat(0x1f2431));
        wheel.rotation.z = Math.PI * 0.5;
        wheel.position.set(x, 0.18, z);
        group.add(wheel);
      });
    });
  } else if (type === "goodsBox") {
    const goods = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.3), mat(0xf2a34b));
    goods.position.set(0, 0.18, 0);
    group.add(goods);
  }

  return group;
}

function createCustomer() {
  const group = new THREE.Group();
  group.userData.kind = "customer";
  group.userData.speed = 2.2 + Math.random() * 0.8;
  group.userData.phase = "toShelf";
  group.userData.target = null;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.2, 12), mat(0x6fa8dc));
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), mat(0xf5d6bd));
  head.position.y = 1.35;
  group.add(body, head);
  group.position.set(0, 0, 13);
  scene.add(group);
  customers.push(group);
}

function addLegs(group, legGeo, color, h, x, z) {
  [
    [-x, h / 2, -z],
    [x, h / 2, -z],
    [-x, h / 2, z],
    [x, h / 2, z]
  ].forEach(([lx, ly, lz]) => {
    const leg = new THREE.Mesh(legGeo, mat(color));
    leg.position.set(lx, ly, lz);
    group.add(leg);
  });
}

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.75 });
}

function addGoodsToSelectedShelf() {
  if (!selectedObject || selectedObject.userData.type !== "shelf") {
    setStatus("请先选中一个货架，再补货。");
    return;
  }
  if (state.storageStock <= 0) {
    setStatus("仓库存货不足，无法补货。");
    return;
  }
  fillShelf(selectedObject, true);
}

function fillShelf(shelf, consumeStorage) {
  if (!shelf || shelf.userData.type !== "shelf") {
    return;
  }

  const oldGoods = shelf.children.filter((c) => c.userData.isGoodsOnShelf);
  oldGoods.forEach((g) => shelf.remove(g));

  const maxSlots = shelf.userData.goodsSlots.length;
  let canFill = maxSlots;
  if (consumeStorage) {
    canFill = Math.min(maxSlots, state.storageStock);
    state.storageStock -= canFill;
  }
  shelf.userData.goodsCount = canFill;

  for (let i = 0; i < canFill; i += 1) {
    const [x, y, z] = shelf.userData.goodsSlots[i];
    const goods = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.22),
      mat(i % 2 === 0 ? 0x58c36f : 0xffc857)
    );
    goods.position.set(x, y, z);
    goods.userData.isGoodsOnShelf = true;
    shelf.add(goods);
  }
  updateStats();
  setStatus(`已补货到 ${canFill}/${maxSlots}。`);
}

function consumeOneGoodsFromShelf(shelf) {
  if (!shelf || shelf.userData.type !== "shelf") {
    return false;
  }
  const goods = shelf.children.find((c) => c.userData.isGoodsOnShelf);
  if (!goods) {
    return false;
  }
  shelf.remove(goods);
  shelf.userData.goodsCount = Math.max(0, (shelf.userData.goodsCount || 0) - 1);
  return true;
}

function findRootPlaceable(node) {
  let current = node;
  while (current && current.parent) {
    if (placeableRootObjects.includes(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function removeObject(object) {
  if (!object) {
    return;
  }
  const idx = placeableRootObjects.indexOf(object);
  if (idx >= 0) {
    placeableRootObjects.splice(idx, 1);
  }
  scene.remove(object);
}

function clearAllPlaced() {
  [...placeableRootObjects].forEach((obj) => scene.remove(obj));
  placeableRootObjects.length = 0;
  selectObject(null);
}

function clearCustomers() {
  [...customers].forEach((c) => scene.remove(c));
  customers.length = 0;
  updateStats();
}

function seedStarterLayout() {
  [
    ["terminal", -7, 0, 10, Math.PI],
    ["shelf", -2, 0, -3, 0],
    ["shelf", 2, 0, -3, 0],
    ["freezer", 8, 0, -8, Math.PI * 0.5],
    ["storage", -10, 0, -8, 0],
    ["cart", 6, 0, 8, 0]
  ].forEach(([type, x, y, z, ry]) => {
    const obj = createUnit(type);
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    scene.add(obj);
    placeableRootObjects.push(obj);
  });
}

function saveLayout() {
  const data = placeableRootObjects.map((obj) => ({
    type: obj.userData.type,
    x: obj.position.x,
    y: obj.position.y,
    z: obj.position.z,
    ry: obj.rotation.y,
    goodsCount: obj.userData.type === "shelf" ? obj.userData.goodsCount || 0 : 0
  }));
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  setStatus(`布局已保存，共 ${data.length} 个设施。`);
}

function loadLayout() {
  const raw = localStorage.getItem(LAYOUT_KEY);
  if (!raw) {
    setStatus("没有可读取的布局数据。");
    return;
  }
  const data = JSON.parse(raw);
  clearAllPlaced();
  clearCustomers();
  resetBusiness();

  data.forEach((item) => {
    const obj = createUnit(item.type);
    obj.position.set(item.x, item.y, item.z);
    obj.rotation.y = item.ry || 0;
    scene.add(obj);
    placeableRootObjects.push(obj);
    if (item.type === "shelf") {
      const toFill = Math.max(0, Math.min(item.goodsCount || 0, obj.userData.goodsSlots.length));
      if (toFill > 0) {
        fillShelfWithExactCount(obj, toFill);
      }
    }
  });
  updateStats();
  syncRegulatorInputs();
  setStatus(`布局已读取，共 ${data.length} 个设施。`);
}

function fillShelfWithExactCount(shelf, count) {
  const oldGoods = shelf.children.filter((c) => c.userData.isGoodsOnShelf);
  oldGoods.forEach((g) => shelf.remove(g));
  shelf.userData.goodsCount = count;
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = shelf.userData.goodsSlots[i];
    const goods = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 0.22),
      mat(i % 2 === 0 ? 0x58c36f : 0xffc857)
    );
    goods.position.set(x, y, z);
    goods.userData.isGoodsOnShelf = true;
    shelf.add(goods);
  }
}

function refillAllShelves(needCost) {
  const shelves = placeableRootObjects.filter((obj) => obj.userData.type === "shelf");
  if (!shelves.length) {
    setStatus("当前没有货架可补货。");
    return;
  }

  const cost = 20;
  if (needCost) {
    if (state.cash < cost) {
      setStatus("资金不足，无法全货架补货。");
      return;
    }
    state.cash -= cost;
    state.storageStock += 18;
  }

  let fillCount = 0;
  shelves.forEach((shelf) => {
    if (state.storageStock > 0) {
      fillShelf(shelf, true);
      fillCount += 1;
    }
  });
  updateStats();
  syncRegulatorInputs();
  setStatus(`已补货 ${fillCount} 个货架。`);
}

function toggleOpen() {
  if (!hasTerminal()) {
    setStatus("没有前台终端，无法开店。");
    return;
  }
  state.isOpen = !state.isOpen;
  document.getElementById("toggle-open").textContent = state.isOpen ? "关店" : "开店";
  setStatus(state.isOpen ? "开始营业，顾客将持续进店。" : "已关店，不再生成新顾客。");
  updateStats();
}

function hasTerminal() {
  return placeableRootObjects.some((obj) => obj.userData.type === "terminal");
}

function getCheckoutPoint() {
  const terminal = placeableRootObjects.find((obj) => obj.userData.type === "terminal");
  if (!terminal) {
    return new THREE.Vector3(0, 0, 11);
  }
  return new THREE.Vector3(terminal.position.x, 0, terminal.position.z + 1.3);
}

function getShelvesWithGoods() {
  return placeableRootObjects.filter(
    (obj) => obj.userData.type === "shelf" && (obj.userData.goodsCount || 0) > 0
  );
}

function updateCustomers(delta) {
  if (state.isOpen) {
    state.spawnTimer += delta;
    if (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer = 0;
      createCustomer();
    }
  }

  for (let i = customers.length - 1; i >= 0; i -= 1) {
    const customer = customers[i];
    const speed = customer.userData.speed;

    if (customer.userData.phase === "toShelf") {
      if (!customer.userData.target) {
        const shelves = getShelvesWithGoods();
        if (!shelves.length) {
          customer.userData.phase = "leave";
          customer.userData.target = new THREE.Vector3(0, 0, 14);
        } else {
          const shelf = shelves[Math.floor(Math.random() * shelves.length)];
          customer.userData.target = shelf;
        }
      }
      const shelf = customer.userData.target;
      if (shelf && shelf.position) {
        const targetPoint = new THREE.Vector3(shelf.position.x, 0, shelf.position.z + 1.4);
        moveToward(customer, targetPoint, delta, speed);
        if (customer.position.distanceTo(targetPoint) < 0.25) {
          const ok = consumeOneGoodsFromShelf(shelf);
          if (ok) {
            customer.userData.phase = "toCheckout";
            customer.userData.target = getCheckoutPoint();
          } else {
            customer.userData.phase = "leave";
            customer.userData.target = new THREE.Vector3(0, 0, 14);
          }
          updateStats();
        }
      }
    } else if (customer.userData.phase === "toCheckout") {
      moveToward(customer, customer.userData.target, delta, speed);
      if (customer.position.distanceTo(customer.userData.target) < 0.3) {
        state.cash += state.salePrice;
        state.soldCount += 1;
        customer.userData.phase = "leave";
        customer.userData.target = new THREE.Vector3(0, 0, 14);
        setStatus("完成一笔结算。");
        updateStats();
      }
    } else if (customer.userData.phase === "leave") {
      moveToward(customer, customer.userData.target, delta, speed + 0.3);
      if (customer.position.distanceTo(customer.userData.target) < 0.25) {
        scene.remove(customer);
        customers.splice(i, 1);
      }
    }
  }
}

function moveToward(object, target, delta, speed) {
  const dir = new THREE.Vector3().subVectors(target, object.position);
  dir.y = 0;
  const distance = dir.length();
  if (distance < 0.0001) {
    return;
  }
  dir.normalize();
  const step = Math.min(distance, speed * delta);
  object.position.addScaledVector(dir, step);
}

function updateFirstPersonMovement(delta) {
  if (!isFirstPerson || !fpControls.isLocked) {
    return;
  }

  const speed = 5.2;
  if (movement.forward) fpControls.moveForward(speed * delta);
  if (movement.backward) fpControls.moveForward(-speed * delta);
  if (movement.left) fpControls.moveRight(-speed * delta);
  if (movement.right) fpControls.moveRight(speed * delta);

  camera.position.y = PLAYER_HEIGHT;
  camera.position.x = clamp(camera.position.x, -MAX_X, MAX_X);
  camera.position.z = clamp(camera.position.z, -MAX_Z, MAX_Z);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetBusiness() {
  state.isOpen = false;
  state.cash = 100;
  state.storageStock = 28;
  state.soldCount = 0;
  state.spawnTimer = 0;
  state.spawnInterval = 4.5;
  state.salePrice = 8;
  document.getElementById("toggle-open").textContent = "开店";
  updateStats();
  syncRegulatorInputs();
}

function applyRegulatorValues() {
  const nextCash = Number(regCashEl.value);
  const nextStock = Number(regStockEl.value);
  const nextCustomers = Number(regCustomersEl.value);
  const nextSpawn = Number(regSpawnEl.value);
  const nextPrice = Number(regPriceEl.value);

  state.cash = Number.isFinite(nextCash) ? Math.max(0, Math.floor(nextCash)) : state.cash;
  state.storageStock = Number.isFinite(nextStock) ? Math.max(0, Math.floor(nextStock)) : state.storageStock;
  state.spawnInterval = Number.isFinite(nextSpawn) ? clamp(nextSpawn, 0.8, 30) : state.spawnInterval;
  state.salePrice = Number.isFinite(nextPrice) ? Math.max(1, Math.floor(nextPrice)) : state.salePrice;

  if (Number.isFinite(nextCustomers)) {
    setCustomersCount(Math.max(0, Math.floor(nextCustomers)));
  }

  updateStats();
  syncRegulatorInputs();
  setStatus("资源调控器参数已应用。");
}

function setCustomersCount(target) {
  while (customers.length < target) {
    createCustomer();
  }
  while (customers.length > target) {
    const c = customers.pop();
    if (c) {
      scene.remove(c);
    }
  }
}

function updateStats() {
  statOpenEl.textContent = state.isOpen ? "营业中" : "关店";
  statCashEl.textContent = `$${state.cash}`;
  statStockEl.textContent = String(state.storageStock);
  statCustomersEl.textContent = String(customers.length);
  statSalesEl.textContent = String(state.soldCount);
}

function syncRegulatorInputs() {
  regCashEl.value = String(state.cash);
  regStockEl.value = String(state.storageStock);
  regCustomersEl.value = String(customers.length);
  regSpawnEl.value = String(state.spawnInterval);
  regPriceEl.value = String(state.salePrice);
}

function snapToGrid(position) {
  return new THREE.Vector3(
    Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    0,
    Math.round(position.z / GRID_SIZE) * GRID_SIZE
  );
}

function setStatus(text) {
  statusEl.textContent = text;
}

function exposeSimulationApi() {
  window.supermarketSim = {
    getState: () => ({
      isOpen: state.isOpen,
      cash: state.cash,
      storageStock: state.storageStock,
      customers: customers.length,
      soldCount: state.soldCount,
      spawnInterval: state.spawnInterval,
      salePrice: state.salePrice
    }),
    setResources: (payload = {}) => {
      if (typeof payload.cash === "number") state.cash = Math.max(0, Math.floor(payload.cash));
      if (typeof payload.storageStock === "number") state.storageStock = Math.max(0, Math.floor(payload.storageStock));
      if (typeof payload.spawnInterval === "number") state.spawnInterval = clamp(payload.spawnInterval, 0.8, 30);
      if (typeof payload.salePrice === "number") state.salePrice = Math.max(1, Math.floor(payload.salePrice));
      if (typeof payload.customers === "number") setCustomersCount(Math.max(0, Math.floor(payload.customers)));
      updateStats();
      syncRegulatorInputs();
    },
    refillAllShelves: () => refillAllShelves(false),
    setOpen: (open) => {
      state.isOpen = Boolean(open);
      document.getElementById("toggle-open").textContent = state.isOpen ? "关店" : "开店";
      updateStats();
    }
  };
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  updateFirstPersonMovement(delta);
  updateCustomers(delta);
  updateStats();
  if (orbitControls.enabled) {
    orbitControls.update();
  }
  renderer.render(scene, camera);
}
