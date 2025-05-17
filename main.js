import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const rawHash = window.location.hash; // "#aura" или "#aura/admin"
const [restaurantId, subPage] = rawHash.slice(1).split("/");

if (!restaurantId) {
  // Показываем список всех ресторанов
  showRestaurantsList();
} else if (subPage === "admin") {
  // Логика админ-панели ресторана
  initAdminPanel(restaurantId);
} else {
  initFullMenuWithCart(restaurantId);
}

async function initFullMenuWithCart(id) {
  try {
    // Показываем индикатор загрузки
    document.body.innerHTML = '<div class="loading">Загрузка меню...</div>';
    
    const docRef = doc(db, "restaurants", id);
    const snap = await getDoc(docRef);
    
    if (!snap.exists()) {
      document.body.innerHTML = "<h2>Ресторан не найден</h2>";
      return;
    }
    
    // Восстанавливаем оригинальную структуру HTML
    document.body.innerHTML = `
      <header class="restaurant-header">
        <div class="container">
          <div class="restaurant-info">
            <div class="restaurant-logo">
              <img id="restaurantLogo" src="" alt="Логотип ресторана">
            </div>
            <div class="restaurant-details">
              <h1 id="restaurantName"></h1>
              <p id="restaurantDescription" class="restaurant-description"></p>
              <div class="restaurant-meta">
                <span id="restaurantAddress" class="meta-item">
                  <i class="icon-location"></i>
                  <span></span>
                </span>
                <span id="restaurantPhone" class="meta-item">
                  <i class="icon-phone"></i>
                  <span></span>
                </span>
                <span id="restaurantSchedule" class="meta-item">
                  <i class="icon-time"></i>
                  <span></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main class="container">
        <section class="menu-section">
          <h2>Меню</h2>
          <div id="categories" class="categories-list"></div>
          <div id="dishes" class="dishes-list"></div>
        </section>
        <section id="cartSection" class="modal hidden"></section>
        <section id="orderSuccess" class="modal hidden">
          <div class="success-box">
            <h2>Спасибо за заказ!</h2>
            <p>Ваш заказ принят. Ожидайте, скоро блюда будут доставлены к вашему столику.</p>
            <button onclick="closeSuccess()">Закрыть</button>
          </div>
        </section>
      </main>
    `;
    
    const data = snap.data();
    document.title = data.name;
    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) pageTitle.textContent = data.name;
    const h1 = document.getElementById("restaurantName");
    if (h1) h1.textContent = data.name;
    const logoImg = document.getElementById("restaurantLogo");
    if (data.logo) logoImg.src = data.logo; else logoImg.style.display = "none";
    const description = document.getElementById("restaurantDescription");
    if (data.description) description.textContent = data.description; else description.style.display = "none";
    const address = document.getElementById("restaurantAddress").querySelector("span");
    if (data.address) address.textContent = data.address; else document.getElementById("restaurantAddress").style.display = "none";
    const phone = document.getElementById("restaurantPhone").querySelector("span");
    if (data.phone) phone.textContent = data.phone; else document.getElementById("restaurantPhone").style.display = "none";
    const schedule = document.getElementById("restaurantSchedule").querySelector("span");
    if (data.schedule) schedule.textContent = data.schedule; else document.getElementById("restaurantSchedule").style.display = "none";

    // --- Загрузка категорий и блюд ---
    const categoriesSnap = await getDocs(collection(db, "restaurants", id, "categories"));
    const categories = [];
    categoriesSnap.forEach(catDoc => {
      categories.push({ id: catDoc.id, ...catDoc.data() });
    });
    const dishesByCategory = {};
    for (const cat of categories) {
      const dishesSnap = await getDocs(collection(db, "restaurants", id, "categories", cat.id, "dishes"));
      dishesByCategory[cat.id] = [];
      dishesSnap.forEach(dishDoc => {
        dishesByCategory[cat.id].push({ id: dishDoc.id, ...dishDoc.data() });
      });
    }

    // --- Корзина ---
    let cart = [];
    let deliveryEnabled = !!data.deliveryEnabled;
    let deliverySelected = false;

    // --- Рендер категорий (кнопки) ---
    const categoriesDiv = document.getElementById("categories");
    categoriesDiv.innerHTML = "";
    if (categories.length === 0) {
      categoriesDiv.innerHTML = '<p>Меню пока не заполнено</p>';
      document.getElementById("dishes").innerHTML = "";
      return;
    }
    let activeCategory = categories[0].id;
    categories.forEach(cat => {
      const btn = document.createElement("button");
      btn.className = "category-btn" + (cat.id === activeCategory ? " active" : "");
      btn.textContent = cat.name;
      btn.onclick = () => {
        activeCategory = cat.id;
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderDishes();
      };
      categoriesDiv.appendChild(btn);
    });

    // --- Рендер блюд ---
    function renderDishes() {
      const dishesDiv = document.getElementById("dishes");
      dishesDiv.innerHTML = "";
      const dishes = dishesByCategory[activeCategory] || [];
      if (dishes.length === 0) {
        dishesDiv.innerHTML = '<p>Нет блюд в этой категории</p>';
        return;
      }
      dishes.forEach(dish => {
        const card = document.createElement("div");
        card.className = "dish-card";
        card.innerHTML = `
          ${dish.image ? `<img src="${dish.image}" class="dish-img" alt="${dish.name}">` : ''}
          <div class="dish-title">${dish.name}</div>
          <div class="dish-desc">${dish.description || ''}</div>
          <div class="dish-price">${dish.price} сом</div>
          <button class="add-to-cart-btn">В корзину</button>
        `;
        card.querySelector('.add-to-cart-btn').onclick = () => addToCart(dish);
        dishesDiv.appendChild(card);
      });
    }
    renderDishes();

    // --- Кнопка корзины в шапке ---
    let cartBtn = document.getElementById('cartBtn');
    if (!cartBtn) {
      cartBtn = document.createElement('button');
      cartBtn.id = 'cartBtn';
      cartBtn.innerHTML = `Корзина <span id="cartCount">0</span>`;
      cartBtn.className = 'btn btn-primary';
      document.querySelector('.restaurant-header .container').appendChild(cartBtn);
    }
    cartBtn.onclick = showCart;
    updateCartCount();

    function addToCart(dish) {
      let item = cart.find(i => i.id === dish.id);
      if (item) {
        item.quantity++;
      } else {
        cart.push({ ...dish, quantity: 1, comment: '' });
      }
      updateCartCount();
    }

    function updateCartCount() {
      const count = cart.reduce((sum, i) => sum + i.quantity, 0);
      const el = document.getElementById('cartCount');
      if (el) el.textContent = count;
    }

    function showCart() {
      const modal = document.getElementById('cartSection');
      modal.classList.remove('hidden');
      modal.classList.add('active');
      modal.style.display = 'flex';
      renderCart();
    }

    function closeCart() {
      const modal = document.getElementById('cartSection');
      modal.classList.add('hidden');
      modal.classList.remove('active');
      modal.style.display = 'none';
    }

    function renderCart() {
      const modal = document.getElementById('cartSection');
      modal.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'cart-box';
      box.innerHTML = `
        <button class="cart-close" onclick="document.getElementById('cartSection').classList.add('hidden')">×</button>
        <div class="cart-title">Корзина</div>
        <ul class="cart-list"></ul>
        <div class="cart-total"></div>
        <form class="cart-form">
          <label>Номер столика*<br><input type="number" id="tableNumber" min="1" required></label>
          ${deliveryEnabled ? '<label><input type="checkbox" id="deliveryCheck"> Доставка (доп. 5%)</label>' : ''}
          <button type="submit">Оформить заказ</button>
        </form>
      `;
      modal.appendChild(box);
      const list = box.querySelector('.cart-list');
      cart.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'cart-item';
        li.innerHTML = `
          <span class="cart-item-title">${item.name}</span>
          <input type="number" min="1" value="${item.quantity}" style="width:48px;" class="cart-qty">
          <input type="text" placeholder="Комментарий" value="${item.comment || ''}" class="cart-comment">
          <span>${item.price * item.quantity} сом</span>
          <button class="del-btn">×</button>
        `;
        li.querySelector('.cart-qty').oninput = (e) => {
          let v = parseInt(e.target.value); if (isNaN(v) || v < 1) v = 1;
          cart[idx].quantity = v;
          renderCart();
        };
        li.querySelector('.cart-comment').oninput = (e) => {
          cart[idx].comment = e.target.value;
        };
        li.querySelector('.del-btn').onclick = () => {
          cart.splice(idx, 1);
          renderCart();
          updateCartCount();
        };
        list.appendChild(li);
      });
      // Итоговая сумма
      let total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
      let delivery = 0;
      if (deliveryEnabled && box.querySelector('#deliveryCheck')?.checked) {
        deliverySelected = true;
        delivery = Math.round(total * 0.05);
      } else {
        deliverySelected = false;
      }
      box.querySelector('.cart-total').innerHTML = `Итого: <b>${total + delivery} сом</b> ${delivery ? `<span style='color:#26a69a;'>(+${delivery} сом доставка)</span>` : ''}`;
      // Оформление заказа
      box.querySelector('.cart-form').onsubmit = async (e) => {
        e.preventDefault();
        if (cart.length === 0) return alert('Корзина пуста');
        const tableNumber = box.querySelector('#tableNumber').value;
        if (!tableNumber) return alert('Укажите номер столика');
        // Собираем заказ
        const order = {
          items: cart.map(i => ({
            dishId: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            comment: i.comment || ''
          })),
          tableNumber,
          delivery: deliverySelected,
          totalAmount: total + delivery,
          createdAt: new Date().toISOString(),
          status: 'new'
        };
        try {
          await addDoc(collection(db, `restaurants/${id}/orders`), order);
          cart = [];
          updateCartCount();
          closeCart();
          showOrderSuccess();
        } catch (err) {
          alert('Ошибка оформления заказа: ' + err.message);
        }
      };
    }

    function showOrderSuccess() {
      const modal = document.getElementById('orderSuccess');
      modal.classList.remove('hidden');
      modal.querySelector('button').onclick = () => {
        modal.classList.add('hidden');
      };
    }
  } catch (error) {
    console.error('Ошибка при загрузке меню:', error);
    document.body.innerHTML = `
      <div class="error-message">
        <h2>Ошибка загрузки меню</h2>
        <p>Пожалуйста, проверьте подключение к интернету и попробуйте снова</p>
        <button onclick="window.location.reload()">Обновить страницу</button>
      </div>
    `;
  }
}

function initAdminPanel(id) {
  const loginForm = document.getElementById("loginForm");
  const adminPanel = document.getElementById("adminPanel");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      await signInWithEmailAndPassword(auth, email, password);
      loginForm.style.display = "none";
      adminPanel.style.display = "block";
      loadAdminMenu(id);
    } catch (err) {
      alert("Ошибка входа: " + err.message);
    }
  });

  const addDishForm = document.getElementById("addDishForm");
  addDishForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("dishName").value;
    const price = document.getElementById("dishPrice").value;
    const imageUrl = document.getElementById("dishImage").value;

    try {
      await addDoc(collection(db, "restaurants", id, "menu"), { name, price, imageUrl });
      addDishForm.reset();
      loadAdminMenu(id);
    } catch (err) {
      alert("Ошибка добавления блюда: " + err.message);
    }
  });
}

async function loadAdminMenu(id) {
  const menuList = document.getElementById("menuList");
  menuList.innerHTML = "";
  const menuSnap = await getDocs(collection(db, "restaurants", id, "menu"));

  menuSnap.forEach((doc) => {
    const dish = doc.data();
    const li = document.createElement("li");
    li.textContent = `${dish.name} — ${dish.price} сом`;
    menuList.appendChild(li);
  });
}

// Создание ресторана и администратора
async function createRestaurantWithAdmin(restaurantData) {
  try {
    // Создаем пользователя-админа ресторана
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      restaurantData.email,
      restaurantData.password
    );

    // Создаем документ ресторана с adminUid
    const restaurantRef = await addDoc(collection(db, 'restaurants'), {
      name: restaurantData.name,
      adminUid: userCredential.user.uid,
      email: restaurantData.email,
      subscriptionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 дней
      deliveryEnabled: false,
      active: true,
      createdAt: serverTimestamp()
    });

    // Можно добавить дополнительные действия, если нужно
    return restaurantRef.id;
  } catch (error) {
    throw new Error('Ошибка при создании ресторана: ' + error.message);
  }
}

// Функция для отображения списка ресторанов
async function showRestaurantsList() {
  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <h1>Рестораны</h1>
    <div class="restaurants-grid" id="restaurantsList"></div>
  `;
  document.body.innerHTML = '';
  document.body.appendChild(container);

  try {
    const restaurantsRef = collection(db, 'restaurants');
    const restaurantsSnap = await getDocs(restaurantsRef);
    
    const restaurantsList = document.getElementById('restaurantsList');
    
    if (restaurantsSnap.empty) {
      restaurantsList.innerHTML = '<p>Пока нет доступных ресторанов</p>';
      return;
    }

    restaurantsSnap.forEach((doc) => {
      const restaurant = doc.data();
      const restaurantCard = document.createElement('div');
      restaurantCard.className = 'restaurant-card';
      restaurantCard.innerHTML = `
        <h3>${restaurant.name}</h3>
        <a href="#${doc.id}" class="btn btn-primary">Перейти в меню</a>
      `;
      restaurantsList.appendChild(restaurantCard);
    });
  } catch (error) {
    console.error('Ошибка загрузки ресторанов:', error);
    document.body.innerHTML = '<h2>Ошибка загрузки списка ресторанов</h2>';
  }
}
