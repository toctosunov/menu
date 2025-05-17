import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Элементы
const loginForm = document.getElementById("loginForm");
const panel = document.getElementById("adminPanel");
const restaurantName = document.getElementById("restaurantName");
const subscriptionInfo = document.getElementById("subscriptionInfo");
const logoutBtn = document.getElementById("logoutBtn");
const navButtons = document.querySelectorAll(".nav-btn");
const sections = document.querySelectorAll(".dashboard-section");

let currentRestaurant = null;

// Глобальная переменная для хранения id редактируемого блюда и категории
let editingDish = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  // Обработка формы входа
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = loginForm.email.value;
      const password = loginForm.password.value;
      
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        alert('Ошибка входа: ' + error.message);
      }
    });
  }

  // Обработка кнопки выхода
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch (error) {
        alert('Ошибка выхода: ' + error.message);
      }
    });
  }

  // Обработка навигации
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      const targetSection = document.getElementById(target);
      if (targetSection) targetSection.classList.add('active');
    });
  });

  // Обработка закрытия модальных окон
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) {
        modal.style.display = 'none';
      }
    });
  });
});

// Проверка авторизации
onAuthStateChanged(auth, async (user) => {
  const loginForm = document.getElementById('loginForm');
  const adminPanel = document.getElementById('adminPanel');
  const restaurantId = window.location.hash.substring(1);

  if (user) {
    // Получаем информацию о пользователе
    const usersRef = collection(db, 'users');
    const userQuery = query(usersRef, where('uid', '==', user.uid));
    const userSnapshot = await getDocs(userQuery);
    
    if (!userSnapshot.empty) {
      const userData = userSnapshot.docs[0].data();
      
      // Проверяем роль пользователя
      if (userData.role !== 'admin') {
        alert('У вас нет доступа к панели администратора');
        await signOut(auth);
        return;
      }

      // Получаем ресторан по restaurantId из URL
      const restaurantRef = doc(db, 'restaurants', restaurantId);
      const restaurantDoc = await getDoc(restaurantRef);

      if (restaurantDoc.exists()) {
        const restaurantData = restaurantDoc.data();
        // Проверяем, что текущий пользователь — админ этого ресторана
        if (userData.restaurantId === restaurantId) {
          currentRestaurant = { ...restaurantData, id: restaurantDoc.id };
          updateRestaurantInfo();
          if (loginForm) loginForm.style.display = 'none';
          if (adminPanel) adminPanel.style.display = 'block';
          loadOrders();
          loadMenu();
          loadChefs();
        } else {
          alert('У вас нет доступа к этому ресторану');
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
    if (adminPanel) adminPanel.style.display = 'none';
  }
});

// Обновление информации о ресторане
function updateRestaurantInfo() {
  restaurantName.textContent = currentRestaurant.name;
  
  const subscriptionEnd = new Date(currentRestaurant.subscriptionUntil);
  const daysLeft = Math.ceil((subscriptionEnd - new Date()) / (1000 * 60 * 60 * 24));
  
  subscriptionInfo.textContent = `Подписка активна еще ${daysLeft} дней`;
}

// Загрузка заказов
async function loadOrders() {
  const ordersList = document.getElementById("ordersList");
  ordersList.innerHTML = "";

  const ordersRef = collection(db, `restaurants/${currentRestaurant.id}/orders`);
  const q = query(ordersRef, orderBy("createdAt", "desc"));
  
  const querySnapshot = await getDocs(q);
  querySnapshot.forEach((doc) => {
    const order = doc.data();
    const orderElement = createOrderElement(doc.id, order);
    ordersList.appendChild(orderElement);
  });
}

// Создание элемента заказа
function createOrderElement(orderId, order) {
  const div = document.createElement("div");
  div.className = "order-card";
  
  const statusClass = {
    new: "status-new",
    in_progress: "status-progress",
    completed: "status-completed"
  }[order.status] || "";

  div.innerHTML = `
    <h3>Заказ #${orderId}</h3>
    <p>Столик: ${order.tableNumber}</p>
    <p>Время: ${new Date(order.createdAt).toLocaleString()}</p>
    <p class="${statusClass}">${getStatusText(order.status)}</p>
    <div class="order-items">
      ${order.items.map(item => `
        <p>${item.name} x${item.quantity}</p>
      `).join('')}
    </div>
    <p>Итого: ${order.totalAmount} сом</p>
  `;

  return div;
}

// Получение текста статуса
function getStatusText(status) {
  const statuses = {
    new: "Новый",
    in_progress: "В процессе",
    completed: "Завершен"
  };
  return statuses[status] || status;
}

// Загрузка меню
async function loadMenu() {
  const menuContainer = document.getElementById('menuContainer');
  if (!menuContainer) return;
  menuContainer.innerHTML = '';

  try {
    // Получаем категории
    const categoriesRef = collection(db, `restaurants/${currentRestaurant.id}/categories`);
    const categoriesSnapshot = await getDocs(categoriesRef);
    const categories = [];
    categoriesSnapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
    if (categories.length === 0) {
      menuContainer.innerHTML = '<p>Нет категорий</p>';
      return;
    }

    // --- Горизонтальный список категорий и кнопка ---
    const catRow = document.createElement('div');
    catRow.className = 'admin-categories-row';
    const tabs = document.createElement('div');
    tabs.className = 'categories-list';
    let activeCategory = categories[0].id;
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'category-btn' + (cat.id === activeCategory ? ' active' : '');
      btn.textContent = cat.name;
      btn.onclick = () => {
        activeCategory = cat.id;
        tabs.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderCategory();
      };
      tabs.appendChild(btn);
    });
    catRow.appendChild(tabs);
    // Кнопка добавить категорию справа
    const addCatBtn = document.createElement('button');
    addCatBtn.className = 'btn btn-primary admin-add-category-btn';
    addCatBtn.textContent = 'Добавить категорию';
    addCatBtn.onclick = showAddCategoryModal;
    catRow.appendChild(addCatBtn);
    menuContainer.appendChild(catRow);

    // --- Рендер выбранной категории и её блюд ---
    function renderCategory() {
      let cat = categories.find(c => c.id === activeCategory);
      let section = menuContainer.querySelector('.admin-category-section');
      if (!section) {
        section = document.createElement('div');
        section.className = 'admin-category-section';
        menuContainer.appendChild(section);
      }
      section.innerHTML = '';
      // Панель управления категорией
      const panel = document.createElement('div');
      panel.className = 'admin-category-panel';
      panel.innerHTML = `
        <h3>${cat.name}</h3>
        <div class="admin-category-actions">
          <button class="btn btn-danger" onclick="deleteCategory('${cat.id}')">Удалить категорию</button>
          <button class="btn btn-primary" onclick="showAddDishModal('${cat.id}')">Добавить блюдо</button>
        </div>
      `;
      section.appendChild(panel);
      // Список блюд
      const dishesList = document.createElement('div');
      dishesList.className = 'admin-dishes-list';
      section.appendChild(dishesList);
      loadDishesForAdmin(cat.id, dishesList);
    }
    renderCategory();
  } catch (error) {
    console.error('Ошибка загрузки меню:', error);
    menuContainer.innerHTML = '<p>Ошибка загрузки меню</p>';
  }
}

// Загрузка блюд для выбранной категории (админка)
async function loadDishesForAdmin(categoryId, container) {
  container.innerHTML = '';
  try {
    const dishesRef = collection(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes`);
    const dishesSnapshot = await getDocs(dishesRef);
    if (dishesSnapshot.empty) {
      container.innerHTML = '<p>Нет блюд в этой категории</p>';
      return;
    }
    dishesSnapshot.forEach((dishDoc) => {
      const dish = dishDoc.data();
      const div = document.createElement('div');
      div.className = 'admin-dish-card';
      div.innerHTML = `
        <div class="admin-dish-title">${dish.name}</div>
        <div class="admin-dish-info">${dish.price} сом${dish.description ? ' — ' + dish.description : ''}</div>
        <div class="admin-dish-actions">
          <button class="btn btn-warning" onclick="editDish('${dishDoc.id}')">Редактировать</button>
          <button class="btn btn-light" onclick="deleteDish('${categoryId}','${dishDoc.id}')">Удалить</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (error) {
    container.innerHTML = '<p>Ошибка загрузки блюд</p>';
  }
}

// Загрузка списка поваров
async function loadChefs() {
  const chefsList = document.getElementById('chefsList');
  chefsList.innerHTML = '';

  const chefsRef = collection(db, `restaurants/${currentRestaurant.id}/chefs`);
  const querySnapshot = await getDocs(chefsRef);
  
  querySnapshot.forEach(doc => {
    const chef = doc.data();
    const chefElement = createChefElement(doc.id, chef);
    chefsList.appendChild(chefElement);
  });
}

// Создание элемента повара
function createChefElement(chefId, chef) {
  const div = document.createElement('div');
  div.className = 'chef-card';
  
  div.innerHTML = `
    <h3>${chef.name}</h3>
    <p>${chef.email}</p>
    <p class="${chef.active ? '' : 'inactive'}">
      ${chef.active ? 'Активен' : 'Неактивен'}
    </p>
  `;
  
  return div;
}

// Глобальные функции для модальных окон
window.showAddDishModal = function(categoryId) {
  const modal = document.getElementById('dishModal');
  const form = document.getElementById('dishForm');
  
  if (modal && form) {
    form.reset();
    // Сохраняем categoryId в data-атрибуте формы
    form.dataset.categoryId = categoryId;
    modal.style.display = 'block';
  }
};

window.showAddCategoryModal = function() {
  const modal = document.getElementById('categoryModal');
  if (modal) {
    const form = document.getElementById('categoryForm');
    if (form) form.reset();
    modal.style.display = 'block';
  }
};

// Изменяем обработчик формы блюда: если editingDish — обновляем, иначе добавляем
const dishForm = document.getElementById('dishForm');
dishForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const form = e.target;
    const categoryId = form.dataset.categoryId;
    const dishId = form.dataset.dishId;
    let dishData = {
      name: form.name.value,
      price: Number(form.price.value),
      description: form.description.value,
      categoryId,
      createdAt: serverTimestamp()
    };
    const imageFile = form.image.files[0];
    if (imageFile) {
      const imageRef = ref(storage, `restaurants/${currentRestaurant.id}/dishes/${Date.now()}_${imageFile.name}`);
      await uploadBytes(imageRef, imageFile);
      dishData.image = await getDownloadURL(imageRef);
    } else if (editingDish && dishId) {
      // Если редактируем и не выбрано новое изображение, оставить старое
      const dishRef = doc(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes/${dishId}`);
      const oldDishSnap = await getDoc(dishRef);
      if (oldDishSnap.exists() && oldDishSnap.data().image) {
        dishData.image = oldDishSnap.data().image;
      }
    }
    if (editingDish && dishId) {
      // Редактирование блюда
      const dishRef = doc(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes/${dishId}`);
      await updateDoc(dishRef, dishData);
      editingDish = null;
    } else {
      // Добавление нового блюда
      await addDoc(collection(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes`), dishData);
    }
    const modal = document.getElementById('dishModal');
    if (modal) modal.style.display = 'none';
    loadMenu();
    alert('Блюдо успешно сохранено');
  } catch (error) {
    console.error('Ошибка при сохранении блюда:', error);
    alert('Ошибка при сохранении блюда: ' + error.message);
  }
});

document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const form = e.target;
    const categoryData = {
      name: form.name.value,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, `restaurants/${currentRestaurant.id}/categories`), categoryData);
    
    const modal = document.getElementById('categoryModal');
    if (modal) modal.style.display = 'none';
    
    loadMenu();
    alert('Категория успешно добавлена');
  } catch (error) {
    alert('Ошибка при добавлении категории: ' + error.message);
  }
});

document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  try {
    const form = e.target;
    const settings = {
      name: form.restaurantName.value,
      deliveryEnabled: form.delivery.checked
    };

    // Загрузка логотипа
    const logoFile = form.logo.files[0];
    if (logoFile) {
      const logoRef = ref(storage, `restaurants/${currentRestaurant.id}/logo`);
      await uploadBytes(logoRef, logoFile);
      settings.logo = await getDownloadURL(logoRef);
    }

    await updateDoc(doc(db, "restaurants", currentRestaurant.id), settings);
    currentRestaurant = { ...currentRestaurant, ...settings };
    updateRestaurantInfo();
    
    alert("Настройки сохранены");
  } catch (error) {
    alert('Ошибка при сохранении настроек: ' + error.message);
  }
});

// Функции для работы с заказами
window.updateOrderStatus = async function(orderId, newStatus) {
  try {
    await updateDoc(doc(db, `restaurants/${currentRestaurant.id}/orders/${orderId}`), {
      status: newStatus
    });
    loadOrders();
  } catch (error) {
    alert('Ошибка при обновлении статуса: ' + error.message);
  }
};

// Функции для работы с блюдами
window.deleteDish = async function(categoryId, dishId) {
  if (confirm('Вы уверены, что хотите удалить это блюдо?')) {
    try {
      await deleteDoc(doc(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes/${dishId}`));
      loadMenu();
    } catch (error) {
      alert('Ошибка при удалении блюда: ' + error.message);
    }
  }
};

// Фильтрация заказов
function filterOrders() {
  const date = document.getElementById('dateFilter').value;
  const status = document.getElementById('statusFilter').value;
  const search = document.getElementById('searchFilter').value.toLowerCase();

  const orders = document.querySelectorAll('.order-card');
  orders.forEach(order => {
    const orderDate = order.querySelector('p:nth-child(2)').textContent;
    const orderStatus = order.querySelector('p:nth-child(3)').textContent;
    const orderContent = order.textContent.toLowerCase();

    const dateMatch = !date || orderDate.includes(date);
    const statusMatch = !status || orderStatus === getStatusText(status);
    const searchMatch = !search || orderContent.includes(search);

    order.style.display = dateMatch && statusMatch && searchMatch ? 'block' : 'none';
  });
}

// Добавляем обработчики фильтров
document.getElementById('dateFilter')?.addEventListener('change', filterOrders);
document.getElementById('statusFilter')?.addEventListener('change', filterOrders);
document.getElementById('searchFilter')?.addEventListener('input', filterOrders);

window.editDish = async function(dishId) {
  // Найти категорию, в которой находится блюдо
  const categoriesRef = collection(db, `restaurants/${currentRestaurant.id}/categories`);
  const categoriesSnapshot = await getDocs(categoriesRef);
  let found = false;
  for (const categoryDoc of categoriesSnapshot.docs) {
    const categoryId = categoryDoc.id;
    const dishRef = doc(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes/${dishId}`);
    const dishSnap = await getDoc(dishRef);
    if (dishSnap.exists()) {
      const dish = dishSnap.data();
      // Открыть модалку и заполнить поля
      const modal = document.getElementById('dishModal');
      const form = document.getElementById('dishForm');
      const imagePreview = document.getElementById('dishImagePreview');
      if (modal && form) {
        form.reset();
        form.name.value = dish.name || '';
        form.price.value = dish.price || '';
        form.description.value = dish.description || '';
        form.dataset.categoryId = categoryId;
        form.dataset.dishId = dishId;
        editingDish = { categoryId, dishId };
        // Показываем текущее изображение
        if (dish.image) {
          imagePreview.src = dish.image;
          imagePreview.style.display = '';
        } else {
          imagePreview.src = '';
          imagePreview.style.display = 'none';
        }
        modal.style.display = 'block';
      }
      found = true;
      break;
    }
  }
  if (!found) {
    alert('Блюдо не найдено');
  }
};

// Предпросмотр выбранного изображения
const imageInput = document.getElementById('image');
const imagePreview = document.getElementById('dishImagePreview');
if (imageInput && imagePreview) {
  imageInput.addEventListener('change', function() {
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = function(e) {
        imagePreview.src = e.target.result;
        imagePreview.style.display = '';
      };
      reader.readAsDataURL(this.files[0]);
    }
  });
}

// Функция для удаления категории и всех её блюд
window.deleteCategory = async function(categoryId) {
  if (!confirm('Удалить категорию и все блюда в ней?')) return;
  try {
    // Удаляем все блюда в категории
    const dishesRef = collection(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}/dishes`);
    const dishesSnap = await getDocs(dishesRef);
    for (const dishDoc of dishesSnap.docs) {
      await deleteDoc(dishDoc.ref);
    }
    // Удаляем саму категорию
    await deleteDoc(doc(db, `restaurants/${currentRestaurant.id}/categories/${categoryId}`));
    loadMenu();
    alert('Категория удалена');
  } catch (error) {
    alert('Ошибка при удалении категории: ' + error.message);
  }
} 