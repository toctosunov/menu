import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { firebaseConfig } from "./firebaseConfig.js";

// инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentRestaurant = null;
let currentChef = null;
let acceptedOrderId = null;

onAuthStateChanged(auth, async (user) => {
  const loginForm = document.getElementById('loginForm');
  const chefPanel = document.getElementById('chefPanel');

  if (user) {
    const usersRef = collection(db, 'users');
    const userQuery = query(usersRef, where('uid', '==', user.uid));
    const userSnapshot = await getDocs(userQuery);

    if (!userSnapshot.empty) {
      const userData = userSnapshot.docs[0].data();

      if (userData.role !== 'chef') {
        alert('У вас нет доступа к панели повара');
        await signOut(auth);
        return;
      }

      const restaurantRef = doc(db, 'restaurants', userData.restaurantId);
      const restaurantDoc = await getDoc(restaurantRef);

      if (restaurantDoc.exists()) {
        currentRestaurant = {
          ...restaurantDoc.data(),
          id: restaurantDoc.id
        };

        if (!userData.chefId) {
          console.error("❌ Отсутствует chefId в userData:", userData);
          alert("Ошибка: ваш аккаунт повара не настроен. Обратитесь к администратору.");
          await signOut(auth);
          return;
        }

        const chefRef = doc(db, `restaurants/${userData.restaurantId}/chefs`, userData.chefId);
        const chefDoc = await getDoc(chefRef);

        if (chefDoc.exists()) {
          const chefData = chefDoc.data();
          if (chefData.active) {
            currentChef = {
              ...chefData,
              id: chefDoc.id
            };

            updateChefInfo();
            if (loginForm) loginForm.style.display = 'none';
            if (chefPanel) chefPanel.style.display = 'block';
            loadOrders();
          } else {
            alert('Ваш аккаунт деактивирован');
            await signOut(auth);
          }
        } else {
          alert('Информация о поваре не найдена');
          await signOut(auth);
        }
      } else {
        alert('Ресторан не найден');
        await signOut(auth);
      }
    } else {
      alert('Пользователь не найден');
      await signOut(auth);
    }
  } else {
    if (loginForm) loginForm.style.display = 'block';
    if (chefPanel) chefPanel.style.display = 'none';
  }
});

// Обновление информации о поваре
function updateChefInfo() {
  const chefName = document.getElementById('chefName');
  const restaurantName = document.getElementById('restaurantName');
  
  if (chefName) chefName.textContent = currentChef.name;
  if (restaurantName) restaurantName.textContent = currentRestaurant.name;
}

// Группировка заказов по категориям
function groupOrdersByCategory(orders) {
  const categories = {
    main: { name: 'Основные блюда', orders: [] },
    salads: { name: 'Салаты', orders: [] },
    drinks: { name: 'Напитки', orders: [] }
  };

  orders.forEach(order => {
    const orderItems = order.items || [];
    orderItems.forEach(item => {
      // Определяем категорию блюда
      let category = 'main'; // По умолчанию
      if (item.name.toLowerCase().includes('салат')) {
        category = 'salads';
      } else if (item.name.toLowerCase().includes('напиток') || 
                 item.name.toLowerCase().includes('чай') || 
                 item.name.toLowerCase().includes('кофе')) {
        category = 'drinks';
      }
      
      // Добавляем заказ в соответствующую категорию
      if (!categories[category].orders.find(o => o.id === order.id)) {
        categories[category].orders.push(order);
      }
    });
  });

  return categories;
}

// Обновленная функция загрузки заказов
function loadOrders() {
  const ordersList = document.getElementById('ordersList');
  if (!ordersList) return;

  const ordersRef = collection(db, `restaurants/${currentRestaurant.id}/orders`);
  const q = query(ordersRef, 
    where('status', 'in', ['new', 'in_progress']),
    orderBy('createdAt', 'desc')
  );

  // Подписываемся на изменения заказов
  onSnapshot(q, (snapshot) => {
    ordersList.innerHTML = '';
    if (snapshot.empty) {
      ordersList.innerHTML = '<p>Нет активных заказов</p>';
      return;
    }

    let orders = [];
    snapshot.forEach((doc) => {
      const order = doc.data();
      orders.push({ id: doc.id, ...order });
    });

    // Если есть принятый заказ — показываем только его
    if (acceptedOrderId) {
      const accepted = orders.find(o => o.id === acceptedOrderId);
      if (accepted) {
        ordersList.appendChild(createOrderElement(accepted.id, accepted));
      } else {
        acceptedOrderId = null;
        renderAllOrders();
      }
    } else {
      renderAllOrders();
    }

    function renderAllOrders() {
      const groupedOrders = groupOrdersByCategory(orders);
      
      // Создаем секции для каждой категории
      Object.entries(groupedOrders).forEach(([categoryId, category]) => {
        if (category.orders.length > 0) {
          const categorySection = document.createElement('div');
          categorySection.className = 'chef-category-section';
          categorySection.innerHTML = `
            <h2 class="chef-category-title">${category.name}</h2>
            <div class="chef-category-orders"></div>
          `;
          
          const ordersContainer = categorySection.querySelector('.chef-category-orders');
          category.orders.forEach(order => {
            ordersContainer.appendChild(createOrderElement(order.id, order));
          });
          
          ordersList.appendChild(categorySection);
        }
      });
    }
  });
}

// Создание элемента заказа
function createOrderElement(orderId, order) {
  const div = document.createElement('div');
  div.className = 'chef-order-card';
  div.innerHTML = `
    <div class="chef-order-header">
      <h3>Заказ #${orderId}</h3>
      <span class="chef-order-status ${order.status}">${getStatusText(order.status)}</span>
    </div>
    <div class="chef-order-info">
      <span>Столик: <b>${order.tableNumber}</b></span>
      <span>Время: ${formatTime(order.createdAt)}</span>
      ${order.delivery ? '<span class="delivery-badge">Доставка</span>' : ''}
    </div>
    <div class="chef-order-items">
      ${order.items.map(item => `
        <div class="chef-order-item">
          <span class="item-name">${item.name}</span>
          <span class="item-qty">x${item.quantity}</span>
          ${item.comment ? `<span class="item-comment">${item.comment}</span>` : ''}
        </div>
      `).join('')}
    </div>
    <div class="chef-order-total">Итого: <b>${order.totalAmount} сом</b></div>
    <div class="chef-order-actions">
      ${order.status === 'new' ? `<button class="btn btn-primary" onclick="acceptOrder('${orderId}')">Принять</button>` : ''}
      ${order.status === 'in_progress' ? `<button class="btn btn-success" onclick="completeOrder('${orderId}')">Заказ выполнен</button>` : ''}
    </div>
  `;
  return div;
}

function formatTime(date) {
  if (!date) return '';
  if (typeof date === 'string') return new Date(date).toLocaleString();
  if (date.toDate) return date.toDate().toLocaleString();
  return new Date(date).toLocaleString();
}

// Получение текста статуса
function getStatusText(status) {
  const statuses = {
    new: 'Новый',
    in_progress: 'В работе',
    completed: 'Завершен'
  };
  return statuses[status] || status;
}

// Принятие заказа в работу
window.acceptOrder = async function(orderId) {
  try {
    await updateDoc(doc(db, `restaurants/${currentRestaurant.id}/orders/${orderId}`), {
      status: 'in_progress',
      chefId: currentChef.id,
      chefName: currentChef.name,
      acceptedAt: new Date()
    });
    acceptedOrderId = orderId;
    loadOrders();
  } catch (error) {
    alert('Ошибка при принятии заказа: ' + error.message);
  }
};

// Завершение заказа
window.completeOrder = async function(orderId) {
  try {
    await updateDoc(doc(db, `restaurants/${currentRestaurant.id}/orders/${orderId}`), {
      status: 'completed',
      completedAt: new Date()
    });
    acceptedOrderId = null;
    loadOrders();
  } catch (error) {
    alert('Ошибка при завершении заказа: ' + error.message);
  }
};

// Выход
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (error) {
      alert('Ошибка выхода: ' + error.message);
    }
  });
}

// Вход
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
      const email = loginForm.querySelector('[name="email"]')?.value;
      const password = loginForm.querySelector('[name="password"]')?.value;
      
      if (!email || !password) {
        throw new Error('Заполните все поля');
      }

      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert('Ошибка входа: ' + error.message);
    }
  });
} 
