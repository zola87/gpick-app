
import { GoogleGenAI } from "@google/genai";
import { Product, Order, Customer } from "../types";

const getGeminiClient = (apiKey?: string) => {
  // Use the provided key, or fallback to process.env (for local dev if set)
  const key = apiKey || process.env.API_KEY;
  if (!key) throw new Error("API Key is missing");
  return new GoogleGenAI({ apiKey: key });
};

export const analyzeSalesData = async (
  products: Product[],
  orders: Order[],
  customers: Customer[],
  apiKey?: string
): Promise<string> => {
  try {
    const ai = getGeminiClient(apiKey);
    
    // Calculate simple profit estimate assuming 0.23 cost rate if not provided, just for analysis
    const totalRev = orders.reduce((acc, o) => {
      const p = products.find(prod => prod.id === o.productId);
      return acc + (p ? p.priceTWD * o.quantity : 0);
    }, 0);

    const dataSummary = {
      productCount: products.length,
      orderCount: orders.length,
      customerCount: customers.length,
      totalRevenue: totalRev,
      categories: [...new Set(products.map(p => p.category))],
      topSelling: products
        .map(p => ({
          name: p.name,
          sold: orders.filter(o => o.productId === p.id).reduce((sum, o) => sum + o.quantity, 0)
        }))
        .sort((a, b) => b.sold - a.sold)
        .slice(0, 5)
    };

    const prompt = `
      我是一個日本代購賣家。請根據以下銷售數據幫我進行分析，並給出建議：
      
      數據摘要:
      ${JSON.stringify(dataSummary, null, 2)}
      
      請提供以下內容（用繁體中文）：
      1. 銷售表現亮點（什麼賣得好？類別分析）
      2. 下次連線建議（可以多找哪類商品？品牌？）
      3. 顧客經營建議。
      
      請保持語氣專業且鼓勵。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "無法生成分析報告。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI 分析服務無法使用。請確認您已在「系統設定」中輸入有效的 Gemini API Key。";
  }
};

export const smartParseOrder = async (
  input: { text?: string; imageBase64?: string },
  products: Product[],
  customers: Customer[],
  apiKey?: string
): Promise<{
  customerName: string;
  productName: string;
  quantity: number;
  variant?: string;
} | null> => {
  try {
    const ai = getGeminiClient(apiKey);
    
    const productList = products.map(p => `${p.name} (Variants: ${p.variants.join(',')})`).join('\n');
    const customerList = customers.map(c => `${c.lineName}`).join(', ');

    const prompt = `
      You are an AI assistant for a Personal Shopper (Daigou). 
      Your task is to parse an order from a text input OR a screenshot of a chat (LINE/WhatsApp).
      
      The input might contain:
      1. A chat log where a customer says what they want.
      2. A simple text list of orders.
      
      Context - Known Data:
      Existing Products: 
      ${productList}
      
      Existing Customers: ${customerList}
      
      Goal: Extract the *single most relevant* order intent.
      
      Extract fields:
      1. **customerName**: The name of the person ordering. 
         - If from a chat screenshot, it's the sender name (usually at the top or next to the bubble).
         - If text, look for patterns like "Amy: +1", "Jason +1".
         - IMPORTANT: If the name is "Amy Chen", keep it as "Amy Chen". Do not split names.
      2. **productName**: Identify the product. Match loosely with Existing Products.
      3. **variant**: Look for colors, sizes (e.g., "Red", "Blue", "L", "White").
      4. **quantity**: Look for "+1", "one", "2 pcs". Default to 1.
      
      Output JSON format strictly:
      {"customerName": string, "productName": string, "quantity": number, "variant": string}
      
      Constraints:
      - Return plain JSON only, no markdown formatting.
      - If multiple items are found, just return the first one.
    `;

    const parts: any[] = [{ text: prompt }];
    
    if (input.text) parts.push({ text: `User Input Text:\n${input.text}` });
    if (input.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/png', // Assuming png/jpeg
          data: input.imageBase64.split(',')[1] // Remove data:image/...;base64,
        }
      });
    }

    const response = await ai.models.generateContent({
      model: input.imageBase64 ? 'gemini-2.5-flash' : 'gemini-2.5-flash',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text);

  } catch (error) {
    console.error("Smart Parse Error", error);
    alert("AI 分析失敗。請確認您已在「系統設定」中輸入有效的 Gemini API Key。");
    return null;
  }
};
