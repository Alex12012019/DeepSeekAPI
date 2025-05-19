import os
import json
import logging
from flask import Flask, request, jsonify, render_template
from pathlib import Path
import datetime
import re
from openai import OpenAI

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
    try:
        conversations = []
        for filename in os.listdir(UPLOAD_FOLDER):
            if filename.endswith('.json'):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    conversations.append({
                        'filename': filename,
                        'name': data.get('meta', {}).get('name', generate_chat_name(data.get('messages', []))),
                        'date': os.path.getmtime(filepath) * 1000  # JavaScript timestamp
                    })
                except Exception as e:
                    logger.error(f"Ошибка загрузки {filename}: {str(e)}")
        
        conversations.sort(key=lambda x: x['date'], reverse=True)
        logger.debug(f"Возвращено {len(conversations)} диалогов")
        return jsonify(conversations)
    except Exception as e:
        logger.error(f"Ошибка в get_conversations: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/load_conversation/<filename>')
def load_conversation(filename):
    try:
        if not filename.endswith('.json') or '/' in filename:
            logger.warning(f"Некорректное имя файла: {filename}")
            return jsonify({'error': 'Invalid filename'}), 400
        
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(filepath):
            logger.warning(f"Файл не найден: {filename}")
            return jsonify({'error': 'File not found'}), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        logger.debug(f"Загружен диалог {filename} с {len(data.get('messages', []))} сообщениями")
        return jsonify({
            'messages': data.get('messages', []),
            'name': data.get('meta', {}).get('name', 'Без названия')
        })
    except Exception as e:
        logger.error(f"Ошибка загрузки диалога {filename}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/send_message', methods=['POST'])
def send_message():
    try:
        logger.debug("Получен запрос: %s", request.json)
        
        if not request.json:
            return jsonify({'error': 'Missing JSON data'}), 400
            
        message = request.json.get('message')
        history = request.json.get('messages', [])
        
        if not message:
            return jsonify({'error': 'Message is required'}), 400
            
        # Формируем полный контекст
        messages = [{"role": "user", "content": message}]
        if history:
            messages = history + messages
            
        logger.debug("Отправка в Deepseek: %s", messages)
        
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            temperature=0.7
        )
        
        reply = response.choices[0].message.content
        return jsonify({
            'status': 'success',
            'assistant_reply': reply,
            'messages': messages + [
                {"role": "assistant", "content": reply}
            ]
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
        filename = data.get('filename')  # Новый параметр для существующих чатов
        custom_name = data.get('name', '').strip()

        if not messages:
            return jsonify({'error': 'Empty conversation'}), 400

        # Если файл указан - перезаписываем, иначе создаём новый
        if filename and os.path.exists(os.path.join(UPLOAD_FOLDER, filename)):
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            with open(filepath, 'r+', encoding='utf-8') as f:
                data = json.load(f)
                data['messages'] = messages
                if custom_name:
                    data['meta']['name'] = custom_name
                f.seek(0)
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.truncate()
            
            name = data['meta']['name']
        else:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            name = sanitize_filename(custom_name) if custom_name else generate_chat_name(messages)
            filename = f"conv_{timestamp}_{name}.json"
            filepath = os.path.join(UPLOAD_FOLDER, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({
                    'meta': {
                        'name': name,
                        'created': datetime.datetime.now().isoformat(),
                        'updated': datetime.datetime.now().isoformat()
                    },
                    'messages': messages
                }, f, indent=2, ensure_ascii=False)

        return jsonify({
            'status': 'success',
            'filename': filename,
            'name': name
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

if __name__ == '__main__':
    logger.info("Запуск приложения")
    app.run(debug=True, port=5000)