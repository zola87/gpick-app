import { GoogleGenAI } from "@google/genai";
import { Product, Order, Customer } from "../types";

const getGeminiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeSalesData = async (
  products: Product[],
  orders: Order[],
  customers: Customer[]
): Promise<string> => {
  try {
    const ai = getGeminiClient();
    
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
    return "AI 分析服務暫時無法使用，請檢查 API Key 設定。";
  }
};

export const smartParseOrder = async (
  input: { text?: string; imageBase64?: string },
  products: Product[],
  customers: Customer[]
): Promise<Array<{
  customerName: string;
  productName: string;
  quantity: number;
  variant?: string;
}> | null> => {
  try {
    const ai = getGeminiClient();
    
    const productList = products.map(p => `${p.name} (ID: ${p.id})`).join(', ');
    const customerList = customers.map(c => `${c.lineName}/${c.nickname}`).join(', ');

    const prompt = `
      You are an expert AI assistant for a Personal Shopper (Daigou).
      Your task is to analyze a CHAT SCREENSHOT (LINE/Messenger) or text input and extract all valid orders.

      Context:
      Known Products: ${productList}
      Known Customers: ${customerList}

      Task:
      Extract a list of orders. 
      IMPORTANT: A single image often contains MULTIPLE people ordering different items (e.g. a list of "+1" from different users in a chat group). 
      You must extract EVERYONE visible in the text/image.
      
      Input Format Examples you might see:
      - Text: "Amy +1, Jason +2, 小美 黑色 1"
      - Image: A screenshot of a LINE chat where user A says "+1", user B says "I want 2". 

      Output Format:
      Return a JSON ARRAY strictly. Do not include markdown formatting.
      [
        { "customerName": "detected_name", "productName": "detected_product", "quantity": number, "variant": "detected_variant" },
        ...
      ]

      Rules:
      1. If input is an image of a chat, identify the SENDER NAME from the chat bubble header or profile name.
      2. If product is not mentioned but context implies (or user selected it in UI), leave productName empty or best guess.
      3. If quantity is "+1", "＋1", it means 1.
      4. If no valid orders found, return [].
    `;

    const parts: any[] = [{ text: prompt }];
    
    if (input.text) parts.push({ text: `User Text: ${input.text}` });
    if (input.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/png', 
          data: input.imageBase64.split(',')[1] 
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) return null;
    
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];

  } catch (error) {
    console.error("Smart Parse Error", error);
    return null;
  }
};