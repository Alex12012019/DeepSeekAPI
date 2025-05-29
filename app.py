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

from gigachat import GigaChat
from gigachat.models import Chat, Messages, MessagesRole

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

def prepare_messages(messages):
    messages2 = []

    # Проверяем, есть ли system-сообщение первым
    if not messages or messages[0].get('role') != 'system':
        messages2.append({
            'role': 'system',
            'content': 'Ты — умный ассистент.'
        })

    # Добавляем остальные сообщения
    for message in messages:
        role = message.get('role', 'user')
        content = message.get('content', '')
        messages2.append({
            'role': role,
            'content': content
        })

    return messages2


@app.route('/api/send_message', methods=['POST'])
def send_message():
    try:
        logger.debug("Получен запрос: %s", request.json)
        
        if not request.json:
            return jsonify({'error': 'Missing JSON data'}), 400
            
        print(request.json.get('messages', []))
        
        # Получаем выбранную модель из запроса
        selected_model = request.json.get('model', 'Deepseek API')
        
        # Настраиваем клиент в зависимости от выбранной модели
        model_config = config['llm'].get(selected_model, config['llm']['Deepseek China'])
        messages = request.json.get('messages', [])
        
        if (model_config.get('interface') == "GigaChat"):
            print("GigaChat model")
            
            messages2 = prepare_messages(messages)

            with GigaChat(credentials=model_config.get('api_key'), verify_ssl_certs=False) as giga:
                response = giga.chat({"messages": messages2})
                print(response)
            
        else:
            print("Deepseek model")
            client = OpenAI(
                api_key=model_config.get('api_key'),
                base_url=model_config.get('base_url')
            )

            response = client.chat.completions.create(
                model=model_config.get('model_name', 'deepseek-chat'),  # Используем model_name из конфига
                messages=messages,
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

@app.route('/api/get_models')
def get_models():
    try:
        models = []
        for model_name, model_config in config['llm'].items():
            models.append({
                'name': model_name,
                'api_key': model_config.get('api_key', ''),
                'base_url': model_config.get('base_url', '')
            })
        return jsonify(models)
    except Exception as e:
        logger.error(f"Error getting models: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
if __name__ == '__main__':
    logger.info("Запуск приложения")
    app.run(debug=True, port=5000)