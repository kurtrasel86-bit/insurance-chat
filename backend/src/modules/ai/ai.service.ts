import { Injectable, Logger } from '@nestjs/common';
import { KbService } from '../kb/kb.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly kb: KbService) {}

  async generateReply(userText: string, options?: { useRAG?: boolean; sessionId?: string }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const useRAG = options?.useRAG ?? true;

    // Fallback: simple heuristic answer if no API key configured
    if (!apiKey) {
      return `Понял запрос: "${userText}". Сейчас это тестовый автоответ. Уточните, пожалуйста, что именно хотите оформить или узнать по страхованию?`;
    }

    try {
      let systemPrompt = `Ты профессиональный страховой консультант. Твоя задача - помочь клиентам выбрать подходящие страховые продукты.

ПРИНЦИПЫ РАБОТЫ:
1. Отвечай дружелюбно, но профессионально
2. Используй простой и понятный язык
3. Будь ЛАКОНИЧНЫМ - максимум 3-4 коротких абзаца
4. Используй списки и структурированный текст
5. Избегай длинных предложений
6. Сразу переходи к делу
7. Обращайся к клиентам на "Вы"

СТРУКТУРА ОТВЕТА:
- Краткое приветствие и понимание потребности
- Основная информация (что покрывает, стоимость)
- Конкретные варианты с компаниями
- Что нужно для оформления

ФОРМАТ ОТВЕТА:
**Заголовок:**
• Пункт 1
• Пункт 2

**Стоимость:** диапазон цен

**Компании:**
• Название - цена
• Название - цена

КОМПАНИИ:
- СОГАЗ: крупнейшая, надежная, конкурентные тарифы
- Ингосстрах: премиум-сегмент, высокое качество сервиса
- Ресо-Гарантия: современные технологии, быстрое урегулирование
- ВСК: специализация на авто, выгодные тарифы
- Росгосстрах: государственная, максимальная надежность

Если вопрос сложный или требует индивидуального подхода, предложи связать клиента с живым агентом.`;

      let context = '';

      // RAG: Поиск релевантной информации в базе знаний (использует текстовый поиск)
      if (useRAG) {
        try {
          const results = await this.kb.search({
            query: userText,
            limit: 3,
          });

          if (results.length > 0) {
            context = results
              .map((r, i) => `[Документ ${i + 1}: ${r.docTitle} (${r.companyCode}/${r.productCode})]\n${r.text}`)
              .join('\n\n');

            systemPrompt = `Ты страховой ассистент. 
Отвечай кратко и по делу, дружелюбно, на русском.
Используй ТОЛЬКО информацию из приведенных документов для ответа.
Если в документах нет нужной информации, честно скажи об этом и предложи связаться с агентом.

=== БАЗА ЗНАНИЙ ===
${context}
===================`;

            this.logger.log(`RAG found ${results.length} relevant chunks for query: "${userText}"`);
          } else {
            this.logger.log(`RAG: no relevant documents found for query: "${userText}"`);
            systemPrompt += '\nВ базе знаний пока нет релевантной информации. Дай общий ответ и предложи связаться с агентом для деталей.';
          }
        } catch (error) {
          this.logger.warn('Ошибка при поиске в базе знаний:', error);
        }
      }

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`OpenAI error: ${response.status} ${text}`);
        return 'Спасибо за вопрос! Сейчас много обращений, уточните, пожалуйста, детали, и я отвечу.';
      }

      const data = (await response.json()) as any;
      const content = data?.choices?.[0]?.message?.content?.trim();
      return content || 'Спасибо за вопрос! Могу уточнить детали, чтобы помочь точнее?';
    } catch (err: any) {
      this.logger.error('AI request failed', err?.stack || String(err));
      return 'Сервис автоответа временно недоступен. Попробуйте спросить иначе или позвать агента.';
    }
  }
}