DeepSeek Chat Interface
Локальный клиент для DeepSeek API с полной историей диалогов.
Реализован за 3 дня в процессе парного программирования с использованием DeepSeek Web.

📦 Возможности
Веб-интерфейс для общения с DeepSeek API.

Сохранение истории диалогов в формате JSON.

Генерация динамических имён файлов для сохранения бесед.

Простая архитектура на Flask с использованием HTML-шаблонов.

🛠️ Структура проекта
plaintext
Копировать
Редактировать
DeepSeekAPI/
├── .vscode/           # Настройки среды разработки
├── conversations/     # Сохранённые диалоги в формате JSON
├── static/            # Статические файлы (CSS, JS)
├── templates/         # HTML-шаблоны для интерфейса
├── app.py             # Основной Flask-приложение
├── app.log            # Лог-файл приложения
├── README.md          # Документация проекта
└── .gitignore         # Исключения для Git
⚙️ Установка и запуск
Клонируйте репозиторий:

bash
Копировать
Редактировать
git clone https://github.com/Alex12012019/DeepSeekAPI.git
cd DeepSeekAPI
Создайте и активируйте виртуальное окружение (опционально):

bash
Копировать
Редактировать
python -m venv venv
source venv/bin/activate  # Для Unix или MacOS
venv\Scripts\activate     # Для Windows
Установите зависимости:

bash
Копировать
Редактировать
pip install -r requirements.txt
Запустите приложение:

bash
Копировать
Редактировать
python app.py
Откройте браузер и перейдите по адресу:

arduino
Копировать
Редактировать
http://localhost:5000
🤝 Совместная разработка с DeepSeek Web
Проект был разработан в тесном сотрудничестве с DeepSeek Web, что позволило:
arxiv.org

Итеративно разрабатывать функции через чат-интерфейс.

Получать мгновенную обратную связь по архитектурным решениям.

Совместно отлаживать и оптимизировать код в реальном времени.

Пример совместно разработанного кода:

python
Копировать
Редактировать
def save_conversation():
    try:
        # Генерация динамического имени файла
        filename = generate_chat_name(messages)
        # Атомарное сохранение файла
        with open(os.path.join("conversations", filename), "w", encoding="utf-8") as f:
            json.dump(messages, f, ensure_ascii=False, indent=2)
    except Exception as e:
        app.logger.error(f"Ошибка при сохранении: {e}")
📄 Лицензия
Этот проект распространяется под лицензией MIT.

Если у вас есть дополнительные пожелания или предложения по улучшению проекта, пожалуйста, создайте issue или отправьте pull request.

Спасибо за использование DeepSeek Chat Interface!
