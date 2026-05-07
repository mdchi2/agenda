document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let tasks = JSON.parse(localStorage.getItem('agenda_tasks')) || [];
    let isDarkMode = localStorage.getItem('agenda_theme') === 'dark';
    let weatherData = JSON.parse(localStorage.getItem('agenda_weather')) || {}; // Cache
    
    // Calendar State
    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDateStr = formatDate(currentDate); // YYYY-MM-DD

    // --- DOM Elements ---
    const taskList = document.getElementById('taskList');
    const emptyState = document.getElementById('emptyState');
    const taskCount = document.getElementById('taskCount');
    const selectedDateTitle = document.getElementById('selectedDateTitle');
    const themeToggle = document.getElementById('themeToggle');
    
    // Calendar DOM
    const currentMonthYearEl = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const calendarGrid = document.getElementById('calendarGrid');

    // Modal DOM
    const fab = document.getElementById('fab');
    const addTaskModal = document.getElementById('addTaskModal');
    const closeModalBtn = document.getElementById('closeModal');
    const taskInput = document.getElementById('taskInput');
    const micBtn = document.getElementById('micBtn');
    const saveTaskBtn = document.getElementById('saveTaskBtn');

    // --- Initialization ---
    migrateOldTasks();
    initTheme();
    renderCalendar();
    updateDateTitle();
    renderTasks();
    
    // Request Weather
    fetchWeather();

    // --- Event Listeners ---
    themeToggle.addEventListener('click', toggleTheme);
    
    prevMonthBtn.addEventListener('click', () => changeMonth(-1));
    nextMonthBtn.addEventListener('click', () => changeMonth(1));

    fab.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    addTaskModal.addEventListener('click', (e) => {
        if(e.target === addTaskModal) closeModal();
    });

    saveTaskBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

    // Speech Recognition
    let recognition;
    let isListening = false;
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES'; // Spanish by default
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('listening');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const currentVal = taskInput.value;
            taskInput.value = currentVal ? currentVal + ' ' + transcript : transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            stopListening();
        };

        recognition.onend = () => {
            stopListening();
        };

        micBtn.addEventListener('click', toggleListening);
    } else {
        // Not supported
        micBtn.style.display = 'none';
    }

    function toggleListening() {
        if (!recognition) return;
        if (isListening) {
            recognition.stop();
        } else {
            taskInput.focus();
            recognition.start();
        }
    }

    function stopListening() {
        isListening = false;
        micBtn.classList.remove('listening');
    }

    // --- Weather Logic ---
    function fetchWeather() {
        let fetched = false;
        
        // Timeout to fallback if geolocation takes too long or silently fails on file:///
        const fallbackTimer = setTimeout(() => {
            if (!fetched) {
                fetched = true;
                console.log("Geolocation timeout. Using fallback.");
                getForecast(-34.6037, -58.3816);
            }
        }, 3000);

        if (window.location.protocol === 'file:' || !("geolocation" in navigator)) {
            // Geolocation often blocked on file:///
            clearTimeout(fallbackTimer);
            fetched = true;
            getForecast(-34.6037, -58.3816);
        } else {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    if (!fetched) {
                        fetched = true;
                        clearTimeout(fallbackTimer);
                        getForecast(position.coords.latitude, position.coords.longitude);
                    }
                },
                (error) => {
                    if (!fetched) {
                        fetched = true;
                        clearTimeout(fallbackTimer);
                        console.warn("Location error.", error);
                        getForecast(-34.6037, -58.3816);
                    }
                },
                { timeout: 2500 }
            );
        }
    }

    async function getForecast(lat, lon) {
        try {
            // Check if we fetched recently and have data
            const lastFetch = localStorage.getItem('agenda_weather_time');
            const hasData = Object.keys(weatherData).length > 0;
            
            if (hasData && lastFetch && (Date.now() - parseInt(lastFetch)) < 2 * 60 * 60 * 1000) {
                renderCalendar(); 
                return;
            }

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data && data.daily) {
                // Map to our dictionary by date
                weatherData = {};
                for (let i = 0; i < data.daily.time.length; i++) {
                    const dateStr = data.daily.time[i];
                    weatherData[dateStr] = {
                        code: data.daily.weathercode[i],
                        max: Math.round(data.daily.temperature_2m_max[i]),
                        min: Math.round(data.daily.temperature_2m_min[i])
                    };
                }
                localStorage.setItem('agenda_weather', JSON.stringify(weatherData));
                localStorage.setItem('agenda_weather_time', Date.now().toString());
                renderCalendar();
            }
        } catch (error) {
            console.error("Error fetching weather:", error);
        }
    }

    function getWeatherIcon(code) {
        // WMO Weather interpretation codes
        if (code === 0) return '☀️'; // Clear
        if (code === 1 || code === 2) return '⛅'; // Partly cloudy
        if (code === 3) return '☁️'; // Overcast
        if (code === 45 || code === 48) return '🌫️'; // Fog
        if (code >= 51 && code <= 57) return '🌧️'; // Drizzle
        if (code >= 61 && code <= 67) return '🌧️'; // Rain
        if (code >= 71 && code <= 77) return '❄️'; // Snow
        if (code >= 80 && code <= 82) return '🌦️'; // Showers
        if (code === 85 || code === 86) return '❄️'; // Snow showers
        if (code >= 95 && code <= 99) return '⛈️'; // Thunderstorm
        return '❓';
    }


    // --- Theme Logic ---
    function initTheme() {
        if (isDarkMode || (!localStorage.getItem('agenda_theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="ri-sun-line"></i>';
            isDarkMode = true;
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeToggle.innerHTML = '<i class="ri-moon-line"></i>';
            isDarkMode = false;
        }
    }

    function toggleTheme() {
        isDarkMode = !isDarkMode;
        if (isDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.innerHTML = '<i class="ri-sun-line"></i>';
            localStorage.setItem('agenda_theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeToggle.innerHTML = '<i class="ri-moon-line"></i>';
            localStorage.setItem('agenda_theme', 'light');
        }
    }

    // --- Calendar Logic ---

    function formatDate(date) {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    function changeMonth(dir) {
        currentMonth += dir;
        if (currentMonth < 0) {
            currentMonth = 11;
            currentYear--;
        } else if (currentMonth > 11) {
            currentMonth = 0;
            currentYear++;
        }
        renderCalendar();
    }

    function getTasksForDate(dateStr) {
        return tasks.filter(t => t.date === dateStr);
    }

    function hasPendingTasks(dateStr) {
        return tasks.some(t => t.date === dateStr && !t.completed);
    }

    function renderCalendar() {
        calendarGrid.innerHTML = '';
        
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        // Adjust JS getDay() (0=Sun, 1=Mon) to start week on Monday (0=Mon, 6=Sun)
        let startingDay = firstDay === 0 ? 6 : firstDay - 1;

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        currentMonthYearEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;

        const todayStr = formatDate(new Date());

        // Empty cells before start of month
        for (let i = 0; i < startingDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyDiv);
        }

        // Days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            
            const thisDateStr = formatDate(new Date(currentYear, currentMonth, i));
            
            // Add day number
            const numSpan = document.createElement('span');
            numSpan.textContent = i;
            dayDiv.appendChild(numSpan);

            if (thisDateStr === todayStr) {
                dayDiv.classList.add('today');
            }
            
            if (thisDateStr === selectedDateStr) {
                dayDiv.classList.add('selected');
            }

            // Weather Info
            const wData = weatherData[thisDateStr];
            if (wData) {
                const weatherDiv = document.createElement('div');
                weatherDiv.className = 'weather-info';
                
                const iconSpan = document.createElement('span');
                iconSpan.className = 'weather-icon';
                iconSpan.textContent = getWeatherIcon(wData.code);
                
                const tempSpan = document.createElement('span');
                tempSpan.textContent = `${wData.max}°`;
                
                weatherDiv.appendChild(iconSpan);
                weatherDiv.appendChild(tempSpan);
                dayDiv.appendChild(weatherDiv);
            }

            // Indicator dot for pending tasks
            if (hasPendingTasks(thisDateStr)) {
                const dot = document.createElement('div');
                dot.className = 'task-dot';
                dayDiv.appendChild(dot);
            }

            dayDiv.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                dayDiv.classList.add('selected');
                selectedDateStr = thisDateStr;
                updateDateTitle();
                renderTasks();
            });

            calendarGrid.appendChild(dayDiv);
        }
    }

    function updateDateTitle() {
        const todayStr = formatDate(new Date());
        if (selectedDateStr === todayStr) {
            selectedDateTitle.textContent = "Hoy";
        } else {
            const dateObj = new Date(selectedDateStr + 'T00:00:00'); // Prevent timezone shift
            const options = { weekday: 'long', month: 'long', day: 'numeric' };
            let dateStr = dateObj.toLocaleDateString('es-ES', options);
            selectedDateTitle.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        }
    }

    // --- Task Logic ---
    function openModal() {
        addTaskModal.classList.remove('hidden');
        setTimeout(() => taskInput.focus(), 100);
    }

    function closeModal() {
        addTaskModal.classList.add('hidden');
        taskInput.value = '';
    }

    function saveTasksToStorage() {
        localStorage.setItem('agenda_tasks', JSON.stringify(tasks));
        renderCalendar(); // Update dots
    }

    function migrateOldTasks() {
        let changed = false;
        const todayStr = formatDate(new Date());
        tasks.forEach(t => {
            if (!t.date) {
                t.date = todayStr;
                changed = true;
            }
        });
        if (changed) saveTasksToStorage();
    }

    function updateCount(dayTasks) {
        const pending = dayTasks.filter(t => !t.completed).length;
        if (dayTasks.length === 0) {
            taskCount.textContent = 'Sin tareas';
            emptyState.classList.remove('hidden');
        } else {
            taskCount.textContent = `${pending} tarea${pending !== 1 ? 's' : ''} pendiente${pending !== 1 ? 's' : ''}`;
            emptyState.classList.add('hidden');
        }
    }

    function addTask() {
        const text = taskInput.value.trim();
        if (!text) return;

        const newTask = {
            id: Date.now().toString(),
            text: text,
            completed: false,
            date: selectedDateStr,
            createdAt: new Date().toISOString()
        };

        tasks.unshift(newTask);
        saveTasksToStorage();
        
        renderTasks();
        closeModal();
    }

    function toggleTaskStatus(id) {
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            saveTasksToStorage();
            renderTasks();
        }
    }

    function deleteTask(id, listItemElement) {
        listItemElement.classList.add('removing');
        
        setTimeout(() => {
            tasks = tasks.filter(t => t.id !== id);
            saveTasksToStorage();
            renderTasks();
        }, 300);
    }

    function renderTasks() {
        taskList.innerHTML = '';
        const dayTasks = getTasksForDate(selectedDateStr);
        
        const sortedTasks = [...dayTasks].sort((a, b) => {
            if (a.completed === b.completed) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            return a.completed ? 1 : -1;
        });

        sortedTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            li.dataset.id = task.id;

            li.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <span class="task-text">${escapeHTML(task.text)}</span>
                <button class="delete-btn" aria-label="Eliminar tarea">
                    <i class="ri-delete-bin-line"></i>
                </button>
            `;

            const checkbox = li.querySelector('.task-checkbox');
            checkbox.addEventListener('change', () => toggleTaskStatus(task.id));

            const textSpan = li.querySelector('.task-text');
            textSpan.addEventListener('click', () => toggleTaskStatus(task.id));

            const deleteBtn = li.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTask(task.id, li);
            });

            taskList.appendChild(li);
        });

        updateCount(dayTasks);
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
