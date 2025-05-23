import os
import json
import logging
from flask import Flask, request, jsonify, render_template
from pathlib import Path
import datetime
import re
from openai import OpenAI
import requests
from bs4 import BeautifulSoup
from pdfminer.high_level import extract_text
from urllib.parse import urlparse


# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log')
    ]
)
logger = logging.getLogger(__name__)

# Загрузка конфигурации
def load_config():
    try:
        with open('config.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Ошибка загрузки config.json: {str(e)}")
        raise RuntimeError(f"Ошибка загрузки config.json: {str(e)}")

config = load_config()

# Инициализация Flask
app = Flask(__name__)
app.secret_key = config['app']['secret_key']
UPLOAD_FOLDER = config['app']['upload_folder']

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Инициализация клиента OpenAI
client = OpenAI(
    api_key=config['openai']['api_key'],
    base_url=config['openai']['base_url']
)

# Вспомогательные функции
def sanitize_filename(name):
    """Очищает имя файла от спецсимволов"""
    return re.sub(r'[\\/*?:"<>|]', "", name)[:50]

def generate_chat_name(messages):
    """Генерирует имя чата на основе первого сообщения"""
    first_user_msg = next((msg for msg in messages if msg["role"] == "user"), None)
    return sanitize_filename(first_user_msg["content"][:30] + "...") if first_user_msg else "Новый чат"

# API Endpoints
@app.route('/')
def home():
    logger.debug("Запрос главной страницы")
    return render_template('index.html')

@app.route('/api/get_conversations')
def get_conversations():
    conversations = []
    upload_folder = os.path.join(os.path.dirname(__file__), app.config['UPLOAD_FOLDER'])
    
    try:
        for filename in os.listdir(upload_folder):
            if filename.endswith('.json'):
                filepath = os.path.join(upload_folder, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    
                    # Получаем метаданные или генерируем имя
                    meta = data.get('meta', {})
                    name = meta.get('name', generate_chat_name(data.get('messages', [])))
                    
                    # Получаем правильное время создания
                    created_time = os.path.getmtime(filepath)
                    
                    conversations.append({
                        'id': meta['id'],
                        'name': name,
                        'filename': filename,
                        'created': meta['created'],
                        'updated': meta['updated'],
                        'messages': data.get('messages', [])
                    })
                    
                except Exception as e:
                    logger.error(f"Error loading {filename}: {str(e)}")
                    continue

        # Сортировка по дате (новые сверху)
        
        conversations.sort(key=lambda x: x['updated'], reverse=True)
        
        return jsonify(conversations)
        
    except Exception as e:
        logger.error(f"Error in get_conversations: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/send_message', methods=['POST'])
def send_message():
    try:
        logger.debug("Получен запрос: %s", request.json)
        
        if not request.json:
            return jsonify({'error': 'Missing JSON data'}), 400
            
        print(request.json.get('messages', []))

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=request.json.get('messages', []),
            temperature=0.7
        )
        
        reply = response.choices[0].message.content
        print(reply)
        return jsonify({
            'status': 'success',
            'assistant_reply': reply
        })
        
    except Exception as e:
        logger.exception("Ошибка в send_message:")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500
    
@app.route('/api/save_conversation', methods=['POST'])
def save_conversation():
    try:
        data = request.json

        messages = data.get('messages', [])
        filename = data.get('filename')  # Может быть None для нового чата
        custom_name = data.get('name', '').strip()

        if not messages:    
            return jsonify({'error': 'Пустой диалог'}), 400

        # Генерируем имя, если не указано
        if not custom_name:
            first_msg = next((m for m in messages if m.get('role') == 'user'), None)
            custom_name = first_msg.get('content', 'Новый чат')[:30] if first_msg else 'Новый чат'

        id = data.get('id')
        # Если файл существует - перезаписываем
        if filename and os.path.exists(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                chat_data = {}
                chat_data['meta'] = {}

                chat_data['meta']['id'] = id
                chat_data['meta']['name'] = custom_name
                chat_data['meta']['updated'] = datetime.datetime.now().isoformat()
                chat_data['meta']['created'] = data.get('created')

                chat_data['messages'] = messages
                json.dump(chat_data, f, indent=2, ensure_ascii=False)
        else:
            # Создаём новый файл
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"conv_{timestamp}_{sanitize_filename(custom_name)}.json"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            id = datetime.datetime.now().isoformat()
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({
                    'meta': {
                        'id': id,
                        'name': custom_name,
                        'created': datetime.datetime.now().isoformat(),
                        'updated': datetime.datetime.now().isoformat()
                    },
                    'messages': messages
                }, f, indent=2, ensure_ascii=False)

        return jsonify({
            'status': 'success',
            'id': id,
            'filename': filename,
            'name': custom_name
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/delete_chat/<filename>', methods=['POST'])
def delete_chat(filename):
    try:
        if not filename.endswith('.json') or '/' in filename:
            logger.warning(f"Некорректное имя файла для удаления: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            logger.warning(f"Файл для удаления не найден: {filename}")
            return jsonify({'error': 'File not found'}), 404
        
        os.remove(filepath)
        logger.info(f"Удален диалог: {filename}")
        return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"Ошибка удаления {filename}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/rename_chat/<filename>', methods=['POST'])
def rename_chat(filename):
    try:
        if not filename.endswith('.json') or '/' in filename:
            logger.warning(f"Некорректное имя файла для переименования: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400
        
        new_name = request.json.get('new_name', '').strip()
        if not new_name:
            logger.warning("Пустое новое имя для переименования")
            return jsonify({'error': 'New name required'}), 400
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            logger.warning(f"Файл для переименования не найден: {filename}")
            return jsonify({'error': 'File not found'}), 404
        
        with open(filepath, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            data['meta']['name'] = new_name
            f.seek(0)
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.truncate()
        
        logger.info(f"Переименован диалог {filename} -> {new_name}")
        return jsonify({
            'status': 'success',
            'new_name': new_name
        })
    except Exception as e:
        logger.error(f"Ошибка переименования {filename}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/debug')
def debug():
    return jsonify({
        'cwd': os.getcwd(),
        'upload_folder': app.config['UPLOAD_FOLDER'],
        'files': os.listdir(os.path.join(os.path.dirname(__file__), app.config['UPLOAD_FOLDER']))
    })

### ***************** новое для загрузки файлов *******************************
# Безопасная проверка путей
def is_safe_path(base_path, target_path):
    base = os.path.abspath(base_path)
    target = os.path.abspath(target_path)
    return os.path.commonpath([base]) == os.path.commonpath([base, target])

# Анализатор файлов
def extract_file_content(filepath):
    try:
        ext = os.path.splitext(filepath)[1].lower()
        
        if ext == '.pdf':
            return extract_text(filepath)
        elif ext in ('.html', '.htm'):
            with open(filepath, 'r', encoding='utf-8') as f:
                soup = BeautifulSoup(f, 'html.parser')
                return soup.get_text(separator='\n', strip=True)
        else:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
                
    except UnicodeDecodeError:
        return "Бинарный файл (нечитаемый текст)"
    except Exception as e:
        raise Exception(f"Ошибка чтения файла: {str(e)}")

def extract_url_content(url):
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        
        if 'text/html' in response.headers.get('Content-Type', ''):
            soup = BeautifulSoup(response.text, 'html.parser')
            return soup.get_text(separator='\n', strip=True)
        return response.text
        
    except Exception as e:
        raise Exception(f"Ошибка чтения URL: {str(e)}")

# API Endpoint
@app.route('/api/analyze', methods=['POST'])
def analyze_content():
    data = request.json
    source = data.get('source')
    max_file_size = 10 * 1024 * 1024  # 10 MB (можно настроить)

    if not source:
        return jsonify({'error': 'Не указан source'}), 400

    try:
        # Обработка локальных файлов
        if source.startswith('file://'):
            filepath = source[7:]
            if not is_safe_path(app.config['UPLOAD_FOLDER'], filepath):
                return jsonify({'error': 'Доступ к файлу запрещён'}), 403
            
            # Проверка размера файла
            if os.path.getsize(filepath) > max_file_size:
                return jsonify({
                    'error': f'Файл слишком большой (максимум {max_file_size/1024/1024} MB)'
                }), 413
                
            content = extract_file_content(filepath)
        
        # Обработка URL
        elif source.startswith(('http://', 'https://')):
            content = extract_url_content(source)
        
        else:
            return jsonify({'error': 'Неподдерживаемый источник'}), 400

        if not content:
            return jsonify({'error': 'Не удалось прочитать контент'}), 500

        return jsonify({
            'status': 'success',
            'content': content  # Теперь возвращаем полный контент
        })

    except Exception as e:
        logger.error(f"Ошибка анализа: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def handle_file_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    try:
        # Сохранение файла временно
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], 'temp', file.filename)
        os.makedirs(os.path.dirname(upload_path), exist_ok=True)
        file.save(upload_path)

        # Анализ содержимого
        content = extract_file_content(upload_path)
        
        # Отправка в DeepSeek API
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{
                "role": "user",
                "content": f"Анализ файла {file.filename}:\n{content[:15000]}..."
            }]
        )
        
        return jsonify({
            'status': 'success',
            'filename': file.filename,
            'analysis': response.choices[0].message.content
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze_file', methods=['POST'])
def analyze_file():
    try:
        file_data = request.json
        
        # Логируем полученные метаданные (без содержимого)
        logger.info(f"Получен файл: {file_data.get('name')} ({file_data.get('size')} bytes)")
        
        # Для текстовых файлов пробуем извлечь текст
        if file_data['type'].startswith('text/'):
            try:
                import base64
                content = base64.b64decode(file_data['content'].split(',')[1]).decode('utf-8')
                analysis = f"Текстовое содержимое ({len(content)} символов):\n\n{content[:5000]}..."
            except:
                analysis = "Не удалось извлечь текст (возможно, бинарный файл)"
        else:
            analysis = f"Бинарный файл {file_data['name']} ({file_data['type']})"

        # Отправляем в DeepSeek API
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{
                "role": "user",
                "content": f"Проанализируй этот файл:\n{analysis}"
            }]
        )
        
        return response.choices[0].message.content

    except Exception as e:
        logger.error(f"Ошибка анализа файла: {str(e)}")
        return f"Ошибка анализа: {str(e)}", 500
    
    

if __name__ == '__main__':
    logger.info("Запуск приложения")
    app.run(debug=True, port=5000)