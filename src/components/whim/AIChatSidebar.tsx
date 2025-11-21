'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, BookOpen, Languages, Send, Loader2, Copy, Check, Plus, MessageSquare, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageClient, ConversationClient, WhimContext } from '@/types';
import { cn } from '@/lib/utils';
import { ChatMessage } from '@/components/chat/ChatMessage';

interface AIChatSidebarProps {
  whimId: string;
  whimContent: string;
  selectedText?: string;
  selectionRange?: { start: number; end: number };
  isOpen: boolean;
  onClose: () => void;
  onApplyEdit: (newContent: string) => void;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const quickActions: QuickAction[] = [
  {
    id: 'explain',
    label: 'Explain',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    prompt: 'Please explain this text in simple terms. What does it mean and what are the key points?',
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: <Languages className="w-3.5 h-3.5" />,
    prompt: 'Please translate this text. If it\'s in English, translate to Chinese. If it\'s in Chinese, translate to English.',
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    prompt: 'Based on this content, please explore related ideas, concepts, or directions I could investigate further.',
  },
];

export function AIChatSidebar({
  whimId,
  whimContent,
  selectedText,
  selectionRange,
  isOpen,
  onClose,
  onApplyEdit,
}: AIChatSidebarProps) {
  const [messages, setMessages] = useState<MessageClient[]>([]);
  const [conversations, setConversations] = useState<ConversationClient[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showConversationList, setShowConversationList] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Handle resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load existing conversations for this whim
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch(`/api/conversations?whimId=${whimId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.conversations && data.conversations.length > 0) {
            // Always load conversations list for dropdown
            setConversations(data.conversations);

            // If text is selected → start new thread
            // If no text selected → load most recent conversation
            if (selectedText) {
              setConversationId(null);
              setMessages([]);
            } else {
              const latestConv = data.conversations[0];
              setConversationId(latestConv.id);
              // Load messages for this conversation
              const msgRes = await fetch(`/api/conversations/${latestConv.id}`);
              if (msgRes.ok) {
                const msgData = await msgRes.json();
                setMessages(msgData.messages || []);
              }
            }
          } else {
            setConversations([]);
            setConversationId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error('Error loading whim conversations:', err);
      }
    };

    if (isOpen && whimId) {
      loadConversations();
    }
  }, [isOpen, whimId, selectedText]);

  // Auto-focus input when sidebar opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to ensure the sidebar is rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Switch to a different conversation
  const switchConversation = async (convId: string) => {
    setConversationId(convId);
    setShowConversationList(false);
    try {
      const msgRes = await fetch(`/api/conversations/${convId}`);
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const createConversation = async (): Promise<string> => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'whim',
        whimId,
        whimContext: {
          selectedText,
          lineRange: selectionRange,
        } as WhimContext,
      }),
    });

    if (!res.ok) {
      throw new Error('Failed to create conversation');
    }

    const data = await res.json();
    return data.id;
  };

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    setInputValue('');

    try {
      // Create conversation if needed
      let convId = conversationId;
      if (!convId) {
        convId = await createConversation();
        const newConv: ConversationClient = {
          id: convId,
          user_id: '',
          title: 'Whim Assistant',
          model: '',
          created_at: new Date(),
          updated_at: new Date(),
          type: 'whim',
          whimId,
        };
        setConversations(prev => [newConv, ...prev]);
        setConversationId(convId);
      }

      // Add user message to UI
      const userMessage: MessageClient = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);

      // Send to API with whim context
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          message,
          whimId,
          whimContext: {
            fullContent: whimContent,
            selectedText,
            lineRange: selectionRange,
          },
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      // Stream response
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantId = `assistant-${Date.now()}`;

      // Add empty assistant message
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: '',
        created_at: new Date(),
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('[CONTENT]')) {
            try {
              const content = JSON.parse(line.slice(9));
              assistantContent += content;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: assistantContent }
                  : m
              ));
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Remove the temporary user message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    const contextInfo = selectedText
      ? `\n\nSelected text:\n"${selectedText}"`
      : '\n\nPlease work with the full document content.';

    sendMessage(action.prompt + contextInfo);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  const handleCopy = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleApply = (content: string) => {
    // Extract content from suggestion blocks if present
    const suggestionMatch = content.match(/```suggestion\n([\s\S]*?)\n```/);
    const textToApply = suggestionMatch ? suggestionMatch[1] : content;
    onApplyEdit(textToApply);
  };

  const startNewConversation = () => {
    // Don't create conversation in database yet - wait until first message is sent
    // Just reset the UI state to prepare for a new conversation
    setConversationId(null);
    setMessages([]);
    setShowConversationList(false);
  };

  // Get conversation preview text
  const getConversationPreview = (conv: ConversationClient) => {
    const date = new Date(conv.updated_at).toLocaleDateString();
    return date;
  };

  if (!isOpen) return null;

  return (
    <div
      ref={sidebarRef}
      className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col h-full relative"
      style={{ width: `${sidebarWidth}px` }}
    >
      {/* Resize Handle */}
      <div
        className="absolute top-0 left-0 w-1 h-full cursor-ew-resize hover:bg-blue-400 bg-slate-300 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Header - Aligned with main content title header (77px) */}
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold italic text-slate-600">Explore</h3>
          <div className="flex items-center gap-2">
            {/* Thread Selector */}
            <button
              onClick={() => setShowConversationList(!showConversationList)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 transition-colors"
            >
              <span className="text-slate-600">
                {conversationId
                  ? `#${conversations.findIndex(c => c.id === conversationId) + 1}`
                  : 'New'
                }
              </span>
              <ChevronDown className={cn(
                "w-3 h-3 text-slate-400 transition-transform",
                showConversationList && "rotate-180"
              )} />
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="text-xs text-slate-600 mt-1">
          Agentic mode • {conversations.length} {conversations.length === 1 ? 'thread' : 'threads'}
        </div>

        {/* Thread Dropdown */}
        {showConversationList && (
          <div className="absolute top-16 left-6 right-6 bg-white border border-slate-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
            <button
              onClick={startNewConversation}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Thread
            </button>
            {conversations.map((conv, index) => (
              <button
                key={conv.id}
                onClick={() => switchConversation(conv.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors",
                  conv.id === conversationId && "bg-slate-100"
                )}
              >
                <span className="text-slate-700">Thread {index + 1}</span>
                <span className="text-slate-400">{getConversationPreview(conv)}</span>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">
                No threads yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context Display */}
      {selectedText && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs font-medium text-blue-700 mb-1">Selected text:</p>
          <p className="text-xs text-blue-600 line-clamp-3">{selectedText}</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-3 border-b border-slate-200">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.id}
              variant="outline"
              size="sm"
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="text-xs h-7 px-2"
            >
              {action.icon}
              <span className="ml-1">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-8 px-4">
            <p>Ask me to help improve, explain, or edit your content.</p>
            <p className="mt-2 text-xs">Use quick actions above or type your question below.</p>
          </div>
        ) : (
          <div className="[&>*]:border-b [&>*]:border-slate-100 last:[&>*]:border-0">
            {messages.map((message) => (
              <div key={message.id}>
                <ChatMessage message={message} />
                {message.role === 'assistant' && message.content && (
                  <div className="flex gap-1 px-6 pb-4 -mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(message.content, message.id)}
                      className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700"
                    >
                      {copiedId === message.id ? (
                        <><Check className="w-3 h-3 mr-1" /> Copied</>
                      ) : (
                        <><Copy className="w-3 h-3 mr-1" /> Copy</>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleApply(message.content)}
                      className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      Apply
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex items-center gap-2 text-sm text-slate-500 px-6 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the content..."
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 min-h-[36px] max-h-[120px]"
          />
          <Button
            onClick={() => sendMessage(inputValue)}
            disabled={isLoading || !inputValue.trim()}
            size="icon"
            className="h-9 w-9 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 text-center">
          Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
