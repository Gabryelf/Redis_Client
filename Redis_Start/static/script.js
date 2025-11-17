// Обновление статистики
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();

        const statsDiv = document.getElementById('stats');

        if (stats.connected) {
            statsDiv.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value">${stats.keys_count}</div>
                    <div class="stat-label">Ключей</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.used_memory}</div>
                    <div class="stat-label">Память</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.connected_clients}</div>
                    <div class="stat-label">Подключения</div>
                </div>
            `;

            // Обновляем статус
            const statusDiv = document.getElementById('redisStatus');
            statusDiv.textContent = 'Status: connected';
            statusDiv.style.background = '#e8f5e8';
            statusDiv.style.color = '#27ae60';
        } else {
            statsDiv.innerHTML = '<p style="color: #e74c3c;">Redis не подключен</p>';
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

// Обновление данных
function refreshData() {
    window.location.reload();
}

// Автообновление статистики каждые 5 секунд
setInterval(updateStats, 5000);

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    updateStats();
});

// Подсказка для JSON в hash
document.getElementById('key_type').addEventListener('change', function(e) {
    const valueTextarea = document.getElementById('value');
    if (e.target.value === 'hash') {
        valueTextarea.placeholder = 'Введите JSON объект\nПример: {"name": "John", "age": 30}';
    } else {
        valueTextarea.placeholder = '';
    }
});