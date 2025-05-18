import React, { useState, useEffect } from 'react';

// Main App Component
export default function App() {
  // State management
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Mock model configurations similar to config.json
  const models = [
    {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 150,
      stop: null,
      prompt_prefix: "Please answer this question: ",
      prompt_suffix: "\nAnswer concisely.",
      system_prompt: "You are a helpful assistant."
    },
    {
      name: 'gpt-4',
      label: 'GPT-4',
      temperature: 0.5,
      top_p: 0.9,
      max_tokens: 300,
      stop: null,
      prompt_prefix: "Analyze this text: ",
      prompt_suffix: "\nProvide detailed analysis.",
      system_prompt: "You are an expert analyst."
    },
    {
      name: 'deepseek',
      label: 'DeepSeek',
      temperature: 0.8,
      top_p: 0.8,
      max_tokens: 200,
      stop: null,
      prompt_prefix: "Translate this to French: ",
      prompt_suffix: "",
      system_prompt: "You are a professional translator."
    }
  ];

  // Load last result from localStorage on component mount
  useEffect(() => {
    const savedResult = localStorage.getItem('lastResult');
    if (savedResult) {
      try {
        setResult(JSON.parse(savedResult));
      } catch (e) {
        console.error('Failed to parse saved result:', e);
      }
    }

    const savedPrompt = localStorage.getItem('lastPrompt');
    if (savedPrompt) {
      setPrompt(savedPrompt);
    }

    const savedModel = localStorage.getItem('lastModel');
    if (savedModel) {
      setSelectedModel(savedModel);
    }
  }, []);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call with mock response
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const selectedConfig = models.find(m => m.name === selectedModel);
      
      // Mock response structure similar to OpenAI's ChatCompletion
      const mockResponse = {
        id: `mock-${Date.now()}`,
        object: "chat.completion",
        created: Date.now(),
        model: selectedModel,
        usage: {
          prompt_tokens: Math.floor(Math.random() * 50) + 10,
          completion_tokens: Math.floor(Math.random() * 100) + 20,
          total_tokens: Math.floor(Math.random() * 150) + 30
        },
        choices: [{
          message: {
            role: "assistant",
            content: generateMockContent(selectedModel, prompt)
          },
          finish_reason: "stop"
        }]
      };
      
      setResult(mockResponse);
      localStorage.setItem('lastResult', JSON.stringify(mockResponse));
      localStorage.setItem('lastPrompt', prompt);
      localStorage.setItem('lastModel', selectedModel);
    } catch (err) {
      setError('Failed to get response from API. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate mock content based on model and prompt
  const generateMockContent = (model, userPrompt) => {
    const baseResponse = `This is a simulated response for the "${userPrompt}" query using the ${model} model.`;
    
    switch(model) {
      case 'gpt-3.5-turbo':
        return `${baseResponse} The response is concise and to the point, as expected from GPT-3.5 Turbo.`;
      case 'gpt-4':
        return `${baseResponse} This response includes more detailed analysis and context, typical of GPT-4.`;
      case 'deepseek':
        return `${baseResponse} The DeepSeek model provides a balanced response with technical depth.`;
      default:
        return baseResponse;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-600 text-white">
      {/* Header */}
      <header className="py-6 border-b border-gray-700 shadow-lg">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            AI Model Query Interface
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Form Card */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 mb-8 border border-gray-700 transition-all duration-300 hover:shadow-purple-500/20">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Send Request</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
                  Your Query
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows="4"
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-gray-400 transition-all"
                  placeholder="Enter your text here..."
                  required
                ></textarea>
              </div>

              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-300 mb-2">
                  Select Model
                </label>
                <select
                  id="model"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white appearance-none transition-all"
                >
                  {models.map((model) => (
                    <option key={model.name} value={model.name} className="bg-gray-800 text-white">
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-all transform hover:-translate-y-0.5 flex items-center justify-center ${
                  isLoading 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-lg hover:shadow-purple-500/20'
                }`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 5L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M5 12L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Submit Request
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Results Section */}
          {result && (
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700 animate-fade-in-down">
              <h2 className="text-2xl font-semibold mb-4 text-purple-300">API Response</h2>
              
              <div className="mb-4">
                <span className="inline-block px-3 py-1 bg-purple-900/50 text-purple-300 text-sm rounded-full mr-2">
                  Model: {result.model}
                </span>
                <span className="inline-block px-3 py-1 bg-blue-900/50 text-blue-300 text-sm rounded-full">
                  ID: {result.id.substring(0, 8)}...
                </span>
              </div>

              <div className="bg-gray-900/70 rounded-lg p-4 overflow-x-auto mb-4">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(result.choices[0].message.content, null, 2)}
                </pre>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                  <p className="text-gray-400 text-sm">Prompt Tokens</p>
                  <p className="text-xl font-semibold text-purple-300">{result.usage.prompt_tokens}</p>
                </div>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                  <p className="text-gray-400 text-sm">Completion Tokens</p>
                  <p className="text-xl font-semibold text-purple-300">{result.usage.completion_tokens}</p>
                </div>
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                  <p className="text-gray-400 text-sm">Total Tokens</p>
                  <p className="text-xl font-semibold text-purple-300">{result.usage.total_tokens}</p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/30 border-l-4 border-red-500 p-4 rounded-lg mt-4 animate-pulse">
              <p className="text-red-200">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-gray-700">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>AI Model Query Interface • Powered by Flask & React</p>
          <p className="mt-1">Simulated API responses for demonstration purposes</p>
        </div>
      </footer>

      {/* Global Styles */}
      <style jsx global>{`
        @keyframes fade-in-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}