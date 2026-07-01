document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('search');
    const date_input = document.getElementById('date_input');
    const building_input = document.getElementById('building_input');
    const btn_motor = document.getElementById('btn_motor');
    const btn_narod = document.getElementById('btn_narod');
    const results = document.getElementById('results');
    const free = document.getElementById('free');
    const busy = document.getElementById('busy');
    const modal = document.getElementById('booking');
    const modal_window = document.getElementById('modal_window');
    const close_modal = document.getElementById('close_modal');

    if (date_input) {
        date_input.valueAsDate = new Date();
    }


    function date_format(user_date) {
        if (!user_date) return '';
        const [year, month, day] = user_date.split('-');
        return `${day}.${month}.${year}`;
    }


    async function form_change() {
        if (!form || !results) return;

        const form_data = new FormData(form);
        const building = form_data.get('building');
        const date = date_format(form_data.get('date'));
        const floor = form_data.get('floor');
        const size = form_data.get('size');
        const checked_boxes = form.querySelectorAll('input[name="lessons"]:checked');
        const selected_lessons = Array.from(checked_boxes).map(cb => cb.value);

        if (selected_lessons.length === 0) {
            results.innerHTML = '<p class="text-gray-500 text-[16px]">Сейчас подберем свободную аудиторию!</p>';
            if (free) free.textContent = '0';
            if (busy) busy.textContent = '0';
            return;
        }

        const lessons_param = selected_lessons.join(',');

        const counter_response = await fetch(`/free_busy?building=${encodeURIComponent(building)}&date=${date}&lesson=${lessons_param}`);
        const counter_data = await counter_response.json();
        if (free) free.textContent = counter_data.free;
        if (busy) busy.textContent = counter_data.busy;

        const rooms_response = await fetch(`/found_free?building=${encodeURIComponent(building)}&floor=${floor}&size=${size}&date=${date}&lesson=${lessons_param}`);
        const rooms_data = await rooms_response.json();

        results_render(rooms_data.free_rooms || []);
    }


    function results_render(rooms) {
        results.innerHTML = '';

        if (rooms.length === 0) {
            results.innerHTML = '<p class="text-[#ff0000] font-bold text-[16px] uppercase">Свободных аудиторий нет, попробуйте изменить параметры</p>';
            return;
        }

        rooms.forEach(room => {
            const new_or_old = room.new_old ? 'Новая' : 'Старая';
            const is_sockets = room.is_socket ? 'Есть розетки' : 'Нет розеток';

            const room_card = document.createElement('div');
            room_card.className = 'border-b border-gray-800 pb-3 pt-2 flex items-center justify-between';
            room_card.innerHTML = `
                <div>
                    <p class="text-[18px] font-bold">Ауд. ${room.room_id}</p>
                    <p class="text-gray-400 text-[14px]">${new_or_old} • ${is_sockets}</p>
                </div>
                <button type="button" data-room-id="${room.room_id}" class="book-btn bg-[#595959] hover:bg-[#444444] text-white text-[13px] font-bold px-4 py-2 rounded-[12px] transition-all duration-200 focus:outline-none uppercase tracking-wider">
                    Бронь
                </button>
            `;
            results.appendChild(room_card);
        });
    }
    async function room_book(room_id) {
        const form_data = new FormData(form);
        const date = date_format(form_data.get('date'));
        const checked_boxes = form.querySelectorAll('input[name="lessons"]:checked');
        const selected_lessons = Array.from(checked_boxes).map(cb => parseInt(cb.value));
        const response = await fetch('/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: room_id, date: date, lessons: selected_lessons })
        });

        const data = await response.json();

        if (modal && modal_window) {
            modal_window.textContent = data.message || 'Аудитория успешно забронирована';
            modal.classList.remove('hidden');
        }

        form_change();
    }

    results.addEventListener('click', (e) => {
        if (e.target.classList.contains('book-btn')) {
            e.preventDefault();
            const room_id = e.target.getAttribute('data-room-id');
            room_book(room_id);
        }
    });

    if (close_modal && modal) {
        close_modal.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    async function update_time() {
        const response = await fetch('/now');
        const data = await response.json();
        const statusInfo = data.lesson_status;
        const timeHeader = document.getElementById('time-lesson-header');
        const subHeader = document.getElementById('time-sub-header');
        const dateHeader = document.getElementById('date-header');
        const weekHeader = document.getElementById('week-header');

        if (statusInfo.status === 'lesson') {
            timeHeader.textContent = `${data.time} / ${statusInfo.number} ПАРА`;
            subHeader.textContent = `ДО КОНЦА ПАРЫ: ${statusInfo.time_left}`;
        } else if (statusInfo.status === 'break') {
            timeHeader.textContent = `${data.time} / ПЕРЕРЫВ`;
            subHeader.textContent = `СЛЕДУЮЩАЯ ПАРА: ${statusInfo.number} (${statusInfo.time_left})`;
        } else if (statusInfo.status === 'not_started') {
            timeHeader.textContent = `${data.time} / ПАРЫ НЕ НАЧАЛИСЬ`;
            subHeader.textContent = `ПЕРВАЯ ПАРА В 09:30`;
        } else {
            timeHeader.textContent = `${data.time} / ПАРЫ ЗАКОНЧИЛИСЬ`;
            subHeader.textContent = `НА СЕГОДНЯ ВСЁ`;
        }

        const now = new Date();
        if (dateHeader) {
            dateHeader.textContent = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        if (weekHeader) {
            weekHeader.textContent = `${data.week.toUpperCase()} Н.`;
        }
    }
    function select_building(active_btn, inactive_btn, value) {
        building_input.value = value;
        active_btn.className = "w-1/2 h-full rounded-[20px] bg-[#595959] text-white font-bold text-[16px] md:text-[18px] uppercase tracking-wider transition-all duration-200 focus:outline-none";
        inactive_btn.className = "w-1/2 h-full rounded-[20px] text-[#595959] font-bold text-[16px] md:text-[18px] uppercase tracking-wider transition-all duration-200 focus:outline-none";
        form_change();
    }

    form.addEventListener('change', form_change);

    if (btn_motor && btn_narod) {
        btn_motor.addEventListener('click', () => select_building(btn_motor, btn_narod, "А"));
        btn_narod.addEventListener('click', () => select_building(btn_narod, btn_motor, "Н"));
    }

    update_time();
    form_change();
    setInterval(update_time, 1000);
});