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

    // Day View DOM
    const dayViewModal = document.getElementById('dayViewModal');
    const closeDayViewBtn = document.getElementById('closeDayView');
    const dayViewWeekday = document.getElementById('dayViewWeekday');
    const dayViewDate = document.getElementById('dayViewDate');
    const dayTasksList = document.getElementById('dayTasksList');
    const dayNoteInput = document.getElementById('dayNoteInput');
    const saveDayNoteBtn = document.getElementById('saveDayNoteBtn');

    // --- Initialization ---
    migrateOldTasks();
    initTheme();
    renderCalendar();
    
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

    // Day View Listeners
    closeDayViewBtn.addEventListener('click', closeDayView);
    dayViewModal.addEventListener('click', (e) => {
        if(e.target === dayViewModal) closeDayView();
    });
    saveDayNoteBtn.addEventListener('click', addDayNote);
    dayNoteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDayNote();
    });

    // Speech Recognition
    let recognition;
    let isListening = false;
    
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        console.log("Speech recognition supported.");
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
        console.warn("Speech recognition NOT supported in this browser.");
        micBtn.style.display = 'none';
    }

    function toggleListening() {
        if (!recognition) return;
        if (isListening) {
            recognition.stop();
        } else {
            if (addTaskModal.classList.contains('hidden')) {
                openModal();
            }
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
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDate(today);

        currentMonthYearEl.textContent = "Próximos 14 días";

        const dayNames = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
        const dayNamesCustom = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA']; // Match the order of getDay()

        // Render exactly 14 days starting from today
        for (let i = 0; i < 14; i++) {
            const thisDate = new Date(today);
            thisDate.setDate(today.getDate() + i);
            const thisDateStr = formatDate(thisDate);
            const dayNum = thisDate.getDate();
            const dayName = dayNames[thisDate.getDay()];

            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            
            // Header: Day number + Day Name + Weather
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.flexDirection = 'column';
            headerDiv.style.gap = '2px';
            headerDiv.style.marginBottom = '4px';

            const topRow = document.createElement('div');
            topRow.style.display = 'flex';
            topRow.style.justifyContent = 'space-between';
            topRow.style.alignItems = 'center';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = dayName;
            nameSpan.style.fontSize = '0.7rem';
            nameSpan.style.fontWeight = '700';
            nameSpan.style.opacity = '0.7';
            
            const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
            const monthName = monthNames[thisDate.getMonth()];

            const numSpan = document.createElement('span');
            numSpan.innerHTML = `${dayNum} <span style="font-size: 0.7rem; opacity: 0.8; margin-left: 2px;">${monthName}</span>`;
            numSpan.style.fontSize = '1.1rem';
            numSpan.style.fontWeight = '700';

            topRow.appendChild(nameSpan);
            topRow.appendChild(numSpan);
            headerDiv.appendChild(topRow);

            // Weather Info
            const wData = weatherData[thisDateStr];
            if (wData) {
                const weatherInfo = document.createElement('div');
                weatherInfo.className = 'weather-info';
                weatherInfo.innerHTML = `<span class="weather-icon">${getWeatherIcon(wData.code)}</span> <span>${wData.max}° / ${wData.min}°</span>`;
                headerDiv.appendChild(weatherInfo);
            }
            
            dayDiv.appendChild(headerDiv);

            if (thisDateStr === todayStr) {
                dayDiv.classList.add('today');
            }
            
            if (thisDateStr === selectedDateStr) {
                dayDiv.classList.add('selected');
            }

            // Inline Tasks
            const dayTasks = getTasksForDate(thisDateStr);
            if (dayTasks.length > 0) {
                const tasksContainer = document.createElement('div');
                tasksContainer.className = 'calendar-tasks';
                
                // Show up to 3 tasks now that the main list is gone
                dayTasks.slice(0, 3).forEach(task => {
                    const taskEl = document.createElement('div');
                    taskEl.className = 'calendar-task' + (task.completed ? ' completed' : '');
                    taskEl.textContent = task.text;
                    tasksContainer.appendChild(taskEl);
                });

                if (dayTasks.length > 3) {
                    const moreEl = document.createElement('div');
                    moreEl.className = 'calendar-task-more';
                    moreEl.textContent = `+${dayTasks.length - 3} más`;
                    tasksContainer.appendChild(moreEl);
                }
                
                dayDiv.appendChild(tasksContainer);
            }

            dayDiv.addEventListener('click', () => {
                document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                dayDiv.classList.add('selected');
                selectedDateStr = thisDateStr;
                // We don't call renderTasks() anymore as the list is gone
            });

            dayDiv.addEventListener('dblclick', () => {
                selectedDateStr = thisDateStr;
                openDayView(thisDateStr);
            });

            calendarGrid.appendChild(dayDiv);
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
        
        closeModal();
    }

    function toggleTaskStatus(id) {
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            saveTasksToStorage();
        }
    }

    function deleteTask(id, listItemElement) {
        listItemElement.classList.add('removing');
        
        setTimeout(() => {
            tasks = tasks.filter(t => t.id !== id);
            saveTasksToStorage();
        }, 300);
    }



    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Day View Logic ---
    function openDayView(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        const dateParts = date.toLocaleDateString('es-ES', options).split(' ');
        
        // Formato: "viernes, 8 de mayo" -> ["viernes,", "8", "de", "mayo"]
        dayViewWeekday.textContent = dateParts[0].replace(',', '');
        dayViewDate.textContent = dateParts.slice(1).join(' ');

        renderDayTasks(dateStr);
        dayViewModal.classList.remove('hidden');
        setTimeout(() => dayNoteInput.focus(), 300);
    }

    function closeDayView() {
        dayViewModal.classList.add('hidden');
        dayNoteInput.value = '';
    }

    function renderDayTasks(dateStr) {
        dayTasksList.innerHTML = '';
        const dayTasks = getTasksForDate(dateStr);

        if (dayTasks.length === 0) {
            dayTasksList.innerHTML = `
                <div class="empty-state">
                    <i class="ri-sticky-note-line"></i>
                    <p>No hay notas para este día</p>
                </div>
            `;
            return;
        }

        dayTasks.forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.className = 'expanded-task-item' + (task.completed ? ' completed' : '');
            
            taskEl.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <span class="task-text">${escapeHTML(task.text)}</span>
                <button class="delete-btn"><i class="ri-delete-bin-line"></i></button>
            `;

            const checkbox = taskEl.querySelector('.task-checkbox');
            checkbox.addEventListener('change', () => {
                toggleTaskStatus(task.id);
                renderDayTasks(dateStr);
            });

            const delBtn = taskEl.querySelector('.delete-btn');
            delBtn.addEventListener('click', () => {
                deleteTask(task.id, taskEl);
                setTimeout(() => renderDayTasks(dateStr), 350);
            });

            dayTasksList.appendChild(taskEl);
        });
    }

    function addDayNote() {
        const text = dayNoteInput.value.trim();
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
        
        dayNoteInput.value = '';
        renderDayTasks(selectedDateStr);
    }
});
