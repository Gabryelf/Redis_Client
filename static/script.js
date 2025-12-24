// Конфигурация
const CONFIG = {
    refreshInterval: 5000, // 5 секунд
    itemsPerPage: 50
};

// Состояние приложения
let appState = {
    currentPage: 1,
    totalPages: 1,
    currentFilter: 'all',
    currentSort: 'key',
    allKeys: [],
    filteredKeys: []
};

// Утилиты
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseSizeToBytes(sizeText) {
    if (!sizeText) return 0;

    const lower = sizeText.toLowerCase();
    const num = parseFloat(sizeText);

    if (lower.includes('kb')) return num * 1024;
    if (lower.includes('mb')) return num * 1024 * 1024;
    if (lower.includes('gb')) return num * 1024 * 1024 * 1024;
    if (lower.includes('tb')) return num * 1024 * 1024 * 1024 * 1024;

    return num; // Bytes или просто число
}

// Обновление статистики
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        if (stats.connected) {
            document.getElementById('keysCount').textContent = stats.keys_count;
            document.getElementById('usedMemory').textContent = stats.used_memory;
            document.getElementById('opsPerSec').textContent = stats.ops_per_sec;

            const total = stats.hits + stats.misses;
            const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : '0.0';
            document.getElementById('hitRate').textContent = `${hitRate}%`;

            const statusIndicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');

            statusIndicator.style.background = '#27ae60';
            statusText.textContent = 'Connected';

            document.getElementById('mainContent').style.display = 'block';
            document.getElementById('connectionCard').style.display = 'none';

        } else {
            showNotification('Redis connection lost', 'error');
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('connectionCard').style.display = 'block';
        }
    } catch (error) {
        console.error('Error updating stats:', error);
        showNotification('Failed to fetch stats', 'error');
    }
}

// Загрузка ключей из таблицы HTML
function loadKeysFromHTML() {
    const tableRows = document.querySelectorAll('#keysTableBody tr');

    if (tableRows.length === 0 || (tableRows.length === 1 && tableRows[0].querySelector('.empty-state'))) {
        appState.allKeys = [];
        appState.filteredKeys = [];
        console.log('Нет ключей в таблице');
        return;
    }

    appState.allKeys = [];

    tableRows.forEach(row => {
        // Пропускаем строку с empty-state
        if (row.querySelector('.empty-state')) return;

        const keyCell = row.querySelector('.key-name');
        const typeBadge = row.querySelector('.type-badge');
        const valuePreview = row.querySelector('.value-preview');
        const sizeBadge = row.querySelector('.size-badge');
        const ttlBadge = row.querySelector('.ttl-badge');

        if (keyCell && typeBadge) {
            const key = keyCell.textContent.trim();
            const type = typeBadge.textContent.trim();
            const preview = valuePreview ? valuePreview.textContent.trim() : '';
            const sizeText = sizeBadge ? sizeBadge.textContent.trim() : '0 Bytes';
            const size = parseSizeToBytes(sizeText);

            let ttl = -1;
            if (ttlBadge) {
                const ttlText = ttlBadge.textContent.trim();
                if (ttlText !== '∞') {
                    const match = ttlText.match(/(\d+)/);
                    ttl = match ? parseInt(match[1]) : -1;
                }
            }

            appState.allKeys.push({
                key: key,
                type: type.toLowerCase(),
                typeDisplay: type,
                preview: preview,
                size: size,
                sizeText: sizeText,
                ttl: ttl
            });
        }
    });

    console.log(`Загружено ключей из HTML: ${appState.allKeys.length}`);
    applyFiltersAndSort();
}

// Фильтрация и сортировка
function applyFiltersAndSort() {
    // Фильтрация
    appState.filteredKeys = appState.allKeys.filter(key => {
        if (appState.currentFilter === 'all') return true;
        return key.type === appState.currentFilter;
    });

    // Сортировка
    appState.filteredKeys.sort((a, b) => {
        switch(appState.currentSort) {
            case 'key':
                return a.key.localeCompare(b.key);
            case 'type':
                return a.type.localeCompare(b.type);
            case 'size':
                return a.size - b.size;
            case 'ttl':
                // Бесконечный TTL (-1) идет в конец
                if (a.ttl === -1 && b.ttl !== -1) return 1;
                if (b.ttl === -1 && a.ttl !== -1) return -1;
                return a.ttl - b.ttl;
            default:
                return a.key.localeCompare(b.key);
        }
    });

    // Обновляем пагинацию
    appState.totalPages = Math.max(1, Math.ceil(appState.filteredKeys.length / CONFIG.itemsPerPage));
    updatePaginationInfo();
}

// Рендеринг таблицы
function renderKeysTable() {
    const tableBody = document.getElementById('keysTableBody');

    if (appState.filteredKeys.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Нет ключей, соответствующих фильтру</p>
                    <button onclick="resetFilters()" class="btn-secondary" style="margin-top: 10px;">
                        <i class="fas fa-redo"></i> Сбросить фильтры
                    </button>
                </td>
            </tr>
        `;
        return;
    }

    const startIndex = (appState.currentPage - 1) * CONFIG.itemsPerPage;
    const endIndex = startIndex + CONFIG.itemsPerPage;
    const pageKeys = appState.filteredKeys.slice(startIndex, endIndex);

    tableBody.innerHTML = pageKeys.map(key => {
        // Безопасное экранирование ключа для использования в onclick
        const safeKey = key.key.replace(/'/g, "\\'").replace(/"/g, '\\"');

        return `
        <tr data-type="${key.type}">
            <td class="key-cell">
                <i class="fas fa-key"></i>
                <span class="key-name">${escapeHtml(key.key)}</span>
            </td>
            <td>
                <span class="type-badge type-${key.type}">
                    ${escapeHtml(key.typeDisplay)}
                </span>
            </td>
            <td class="value-cell">
                <div class="value-preview">
                    ${escapeHtml(key.preview)}
                </div>
            </td>
            <td>
                <span class="size-badge">
                    ${escapeHtml(key.sizeText)}
                </span>
            </td>
            <td>
                ${key.ttl > 0 ? `
                    <span class="ttl-badge">
                        ${key.ttl}s
                    </span>
                ` : `
                    <span class="ttl-badge infinite">
                        ∞
                    </span>
                `}
            </td>
            <td>
                <div class="action-buttons">
                    <button onclick="viewKey('${safeKey}')"
                            class="btn-icon btn-info"
                            title="Просмотреть">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editKey('${safeKey}')"
                            class="btn-icon btn-warning"
                            title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteKey('${safeKey}')"
                            class="btn-icon btn-danger"
                            title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button onclick="copyKey('${safeKey}')"
                            class="btn-icon btn-secondary"
                            title="Копировать ключ">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');

    updatePaginationInfo();
}

function resetFilters() {
    document.getElementById('typeFilter').value = 'all';
    document.getElementById('sortBy').value = 'key';
    appState.currentFilter = 'all';
    appState.currentSort = 'key';
    appState.currentPage = 1;
    applyFiltersAndSort();
    renderKeysTable();
}

function filterKeys() {
    const filter = document.getElementById('typeFilter').value;
    appState.currentFilter = filter;
    appState.currentPage = 1;
    applyFiltersAndSort();
    renderKeysTable();
}

function sortKeys() {
    const sortBy = document.getElementById('sortBy').value;
    appState.currentSort = sortBy;
    appState.currentPage = 1;
    applyFiltersAndSort();
    renderKeysTable();
}

function updatePaginationInfo() {
    const totalKeys = appState.filteredKeys.length;
    const shownStart = totalKeys === 0 ? 0 : ((appState.currentPage - 1) * CONFIG.itemsPerPage) + 1;
    const shownEnd = Math.min(appState.currentPage * CONFIG.itemsPerPage, totalKeys);

    // Обновляем элемент общего количества
    const totalCountElement = document.getElementById('totalCount');
    if (totalCountElement) {
        totalCountElement.textContent = totalKeys;
    }

    // Обновляем элемент показанных ключей
    const shownCountElement = document.getElementById('shownCount');
    if (shownCountElement) {
        if (totalKeys > 0 && shownStart <= shownEnd) {
            shownCountElement.textContent = shownEnd === shownStart ?
                String(shownStart) : `${shownStart}-${shownEnd}`;
        } else {
            shownCountElement.textContent = '0';
        }
    }

    // Обновляем информацию о странице
    const pageInfoElement = document.getElementById('pageInfo');
    if (pageInfoElement) {
        pageInfoElement.textContent =
            `Страница ${appState.currentPage} из ${appState.totalPages}`;
    }
}

function nextPage() {
    if (appState.currentPage < appState.totalPages) {
        appState.currentPage++;
        renderKeysTable();
    }
}

function prevPage() {
    if (appState.currentPage > 1) {
        appState.currentPage--;
        renderKeysTable();
    }
}

// Поиск ключей
async function searchKeys() {
    const pattern = document.getElementById('searchInput').value || '*';

    try {
        const response = await fetch(`/api/search?pattern=${encodeURIComponent(pattern)}`);
        const data = await response.json();

        if (data.keys && data.keys.length > 0) {
            // Фильтруем текущие ключи по результатам поиска
            const foundKeys = new Set(data.keys);
            appState.allKeys = appState.allKeys.filter(key => foundKeys.has(key.key));
            appState.currentPage = 1;
            applyFiltersAndSort();
            renderKeysTable();
            showNotification(`Найдено ${data.keys.length} ключей`, 'success');
        } else {
            showNotification('Ключи не найдены', 'info');
        }
    } catch (error) {
        console.error('Error searching keys:', error);
        showNotification('Ошибка при поиске', 'error');
    }
}

// Просмотр ключа
async function viewKey(key) {
    try {
        const response = await fetch(`/key/${encodeURIComponent(key)}`);
        const keyData = await response.json();

        let content = '';

        switch(keyData.type) {
            case 'string':
                content = renderStringView(keyData);
                break;
            case 'hash':
                content = renderHashView(keyData);
                break;
            case 'list':
                content = renderListView(keyData);
                break;
            case 'set':
                content = renderSetView(keyData);
                break;
            case 'zset':
                content = renderZSetView(keyData);
                break;
            default:
                content = `<p>Тип ${keyData.type} не поддерживается для детального просмотра</p>`;
        }

        document.getElementById('viewKeyTitle').innerHTML =
            `<i class="fas fa-eye"></i> Просмотр ключа: ${escapeHtml(key)}`;
        document.getElementById('keyDetailsContent').innerHTML = content;

        openModal('viewKeyModal');

    } catch (error) {
        console.error('Error viewing key:', error);
        showNotification('Ошибка при загрузке ключа', 'error');
    }
}

function renderStringView(keyData) {
    return `
        <div class="key-meta">
            <div class="meta-item">
                <strong>Тип:</strong>
                <span class="type-badge type-${keyData.type}">${keyData.type}</span>
            </div>
            <div class="meta-item">
                <strong>TTL:</strong>
                <span>${keyData.ttl > 0 ? keyData.ttl + ' секунд' : 'Бесконечно'}</span>
            </div>
            <div class="meta-item">
                <strong>Размер:</strong>
                <span>${formatBytes(keyData.size)}</span>
            </div>
            <div class="meta-item">
                <strong>Кодировка:</strong>
                <span>${keyData.encoding || 'unknown'}</span>
            </div>
        </div>
        <div class="value-display">
            <h4>Значение:</h4>
            <pre class="json-display">${escapeHtml(JSON.stringify(keyData.value, null, 2))}</pre>
        </div>
    `;
}

function renderHashView(keyData) {
    const fields = Object.entries(keyData.value || {});

    return `
        <div class="key-meta">
            <div class="meta-item">
                <strong>Тип:</strong>
                <span class="type-badge type-${keyData.type}">${keyData.type}</span>
            </div>
            <div class="meta-item">
                <strong>Поля:</strong>
                <span>${keyData.length || fields.length}</span>
            </div>
            <div class="meta-item">
                <strong>TTL:</strong>
                <span>${keyData.ttl > 0 ? keyData.ttl + ' секунд' : 'Бесконечно'}</span>
            </div>
            <div class="meta-item">
                <strong>Размер:</strong>
                <span>${formatBytes(keyData.size)}</span>
            </div>
        </div>
        <div class="value-display">
            <h4>Поля (${fields.length}):</h4>
            <div class="hash-fields">
                ${fields.map(([field, value]) => `
                    <div class="hash-field">
                        <div class="field-name">${escapeHtml(field)}:</div>
                        <div class="field-value">${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderListView(keyData) {
    const items = keyData.value || [];

    return `
        <div class="key-meta">
            <div class="meta-item">
                <strong>Тип:</strong>
                <span class="type-badge type-${keyData.type}">${keyData.type}</span>
            </div>
            <div class="meta-item">
                <strong>Элементов:</strong>
                <span>${keyData.length || items.length}</span>
            </div>
            <div class="meta-item">
                <strong>TTL:</strong>
                <span>${keyData.ttl > 0 ? keyData.ttl + ' секунд' : 'Бесконечно'}</span>
            </div>
        </div>
        <div class="value-display">
            <h4>Элементы списка (${items.length}):</h4>
            <div class="list-items">
                ${items.map((item, index) => `
                    <div class="list-item">
                        <div class="item-index">[${index}]</div>
                        <div class="item-value">${escapeHtml(typeof item === 'object' ? JSON.stringify(item) : item)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderSetView(keyData) {
    const members = keyData.value || [];

    return `
        <div class="key-meta">
            <div class="meta-item">
                <strong>Тип:</strong>
                <span class="type-badge type-${keyData.type}">${keyData.type}</span>
            </div>
            <div class="meta-item">
                <strong>Элементов:</strong>
                <span>${keyData.length || members.length}</span>
            </div>
            <div class="meta-item">
                <strong>TTL:</strong>
                <span>${keyData.ttl > 0 ? keyData.ttl + ' секунд' : 'Бесконечно'}</span>
            </div>
        </div>
        <div class="value-display">
            <h4>Элементы множества (${members.length}):</h4>
            <div class="set-members">
                ${members.map((member, index) => `
                    <div class="set-member">
                        <div class="member-value">${escapeHtml(typeof member === 'object' ? JSON.stringify(member) : member)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderZSetView(keyData) {
    const items = keyData.value || [];

    return `
        <div class="key-meta">
            <div class="meta-item">
                <strong>Тип:</strong>
                <span class="type-badge type-${keyData.type}">${keyData.type}</span>
            </div>
            <div class="meta-item">
                <strong>Элементов:</strong>
                <span>${keyData.length || items.length}</span>
            </div>
            <div class="meta-item">
                <strong>TTL:</strong>
                <span>${keyData.ttl > 0 ? keyData.ttl + ' секунд' : 'Бесконечно'}</span>
            </div>
        </div>
        <div class="value-display">
            <h4>Элементы сортированного множества (${items.length}):</h4>
            <table class="zset-table">
                <thead>
                    <tr>
                        <th>Ранг</th>
                        <th>Значение</th>
                        <th>Счёт</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map((item, index) => `
                        <tr>
                            <td>${index}</td>
                            <td>${escapeHtml(typeof item.member === 'object' ? JSON.stringify(item.member) : item.member)}</td>
                            <td class="score">${item.score}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Редактирование ключа
async function editKey(key) {
    try {
        const response = await fetch(`/key/${encodeURIComponent(key)}`);
        const keyData = await response.json();

        document.getElementById('newKey').value = keyData.key;
        document.getElementById('newKeyType').value = keyData.type;

        let valueToShow = '';
        if (keyData.type === 'hash') {
            valueToShow = JSON.stringify(keyData.value, null, 2);
        } else if (keyData.type === 'list' || keyData.type === 'set') {
            valueToShow = JSON.stringify(keyData.value, null, 2);
        } else if (keyData.type === 'zset') {
            const simpleArray = keyData.value.map(item => item.member);
            valueToShow = JSON.stringify(simpleArray, null, 2);
        } else {
            valueToShow = keyData.value;
        }

        document.getElementById('newValue').value = valueToShow;
        document.getElementById('newTTL').value = keyData.ttl;

        document.querySelector('#addKeyModal h3').innerHTML =
            `<i class="fas fa-edit"></i> Редактировать ключ: ${escapeHtml(key)}`;

        openModal('addKeyModal');

    } catch (error) {
        console.error('Error editing key:', error);
        showNotification('Ошибка при редактировании ключа', 'error');
    }
}

// Удаление ключа
async function deleteKey(key) {
    Swal.fire({
        title: 'Удалить ключ?',
        text: `Вы уверены, что хотите удалить ключ "${key}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Да, удалить!',
        cancelButtonText: 'Отмена'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const response = await fetch(`/delete/${encodeURIComponent(key)}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    showNotification(`Ключ "${key}" удален`, 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    throw new Error('Failed to delete key');
                }
            } catch (error) {
                console.error('Error deleting key:', error);
                showNotification('Ошибка при удалении ключа', 'error');
            }
        }
    });
}

// Копирование ключа
function copyKey(key) {
    navigator.clipboard.writeText(key).then(() => {
        showNotification(`Ключ "${key}" скопирован`, 'success');
    }).catch(err => {
        console.error('Error copying key:', err);
        showNotification('Ошибка при копировании', 'error');
    });
}

// Добавление ключа
function showAddKeyModal() {
    document.querySelector('#addKeyModal h3').innerHTML =
        `<i class="fas fa-plus-circle"></i> Добавить ключ`;
    document.getElementById('newKey').value = '';
    document.getElementById('newValue').value = '';
    document.getElementById('newTTL').value = -1;
    document.getElementById('newKeyType').value = 'string';
    onTypeChange();
    openModal('addKeyModal');
}

function onTypeChange() {
    const type = document.getElementById('newKeyType').value;
    const textarea = document.getElementById('newValue');
    const hint = document.getElementById('valueHint');

    switch(type) {
        case 'string':
            textarea.placeholder = 'Введите строковое значение...';
            hint.textContent = 'Можно вводить любой текст или JSON';
            break;
        case 'hash':
            textarea.placeholder = '{"field1": "value1", "field2": "value2"}';
            hint.textContent = 'Введите JSON объект с полями и значениями';
            break;
        case 'list':
            textarea.placeholder = '["item1", "item2", "item3"]';
            hint.textContent = 'Введите JSON массив с элементами списка';
            break;
        case 'set':
        case 'zset':
            textarea.placeholder = '["member1", "member2", "member3"]';
            hint.textContent = 'Введите JSON массив с элементами множества';
            break;
    }
}

// Очистка базы данных
function confirmFlush() {
    Swal.fire({
        title: 'Очистить всю базу?',
        text: 'Это действие удалит ВСЕ ключи из текущей базы данных. Отменить невозможно!',
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#7f8c8d',
        confirmButtonText: 'Да, очистить всё!',
        cancelButtonText: 'Отмена'
    }).then((result) => {
        if (result.isConfirmed) {
            document.querySelector('form[action="/flush/"]').submit();
        }
    });
}

// Модальные окна
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Обновление данных
function refreshData() {
    window.location.reload();
}

// Обработчики форм
document.getElementById('addKeyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const key = document.getElementById('newKey').value;
    const valueType = document.getElementById('newKeyType').value;
    const value = document.getElementById('newValue').value;
    const ttl = parseInt(document.getElementById('newTTL').value);

    try {
        const formData = new FormData();
        formData.append('key', key);
        formData.append('value_type', valueType);
        formData.append('value', value);
        formData.append('ttl', ttl);

        const response = await fetch('/set/', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            showNotification(`Ключ "${key}" сохранен`, 'success');
            closeModal('addKeyModal');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            throw new Error('Failed to save key');
        }
    } catch (error) {
        console.error('Error saving key:', error);
        showNotification('Ошибка при сохранении ключа', 'error');
    }
});

// Подключение к Redis
document.getElementById('connectionForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const host = document.getElementById('redisHost').value;
    const port = document.getElementById('redisPort').value;
    const db = document.getElementById('redisDB').value;
    const password = document.getElementById('redisPassword').value;

    showNotification('Перезапустите приложение с новыми параметрами', 'info');
});

// Закрытие модальных окон при клике вне их
window.addEventListener('click', (e) => {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация приложения...');
    initTheme();
    // Сначала загружаем ключи из HTML
    loadKeysFromHTML();

    // Затем проверяем подключение и обновляем статистику
    fetch('/api/test-connection')
        .then(response => response.json())
        .then(data => {
            if (data.connected) {
                updateStats();
            } else {
                document.getElementById('mainContent').style.display = 'none';
                document.getElementById('connectionCard').style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error checking connection:', error);
            document.getElementById('mainContent').style.display = 'none';
            document.getElementById('connectionCard').style.display = 'block';
        });

    // Автообновление статистики
    setInterval(updateStats, CONFIG.refreshInterval);

    // Обработчик Enter в поле поиска
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchKeys();
        }
    });
});

// Функция для переключения темы
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const themeIcon = document.querySelector('.theme-toggle i');
    showNotification(`Тема изменена на ${newTheme === 'dark' ? 'тёмную' : 'светлую'}`, 'info');
}

// Инициализация темы
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Добавляем кнопку переключения темы в header
    const headerRight = document.querySelector('.header-right');
    if (headerRight && !document.querySelector('.theme-toggle')) {
        const themeToggle = document.createElement('div');
        themeToggle.className = 'theme-toggle';
        themeToggle.onclick = toggleTheme;
        themeToggle.innerHTML = `
            <i class="fas fa-sun"></i>
            <i class="fas fa-moon"></i>
        `;
        headerRight.insertBefore(themeToggle, headerRight.firstChild);
    }
}
