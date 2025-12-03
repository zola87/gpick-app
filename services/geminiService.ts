
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
    return "AI 分析服務暫時無法使用，請檢查 API Key 設定。";
  }
};

export const smartParseOrder = async (
  input: { text?: string; imageBase64?: string },
  products: Product[],
  customers: Customer[]
): Promise<{
  customerName: string;
  productName: string;
  quantity: number;
  variant?: string;
} | null> => {
  try {
    const ai = getGeminiClient();
    
    const productList = products.map(p => `${p.name} (ID: ${p.id})`).join(', ');
    const customerList = customers.map(c => `${c.lineName}/${c.nickname}`).join(', ');

    const prompt = `
      You are a parsing assistant for a "Daigou" (Personal Shopper).
      Identify the Customer Name, Product Name, Variant (Color/Size), and Quantity from the input.
      
      Existing Products: ${productList}
      Existing Customers: ${customerList}
      
      Rules:
      1. If the product name vaguely matches an existing one, use the existing name.
      2. If the customer vaguely matches, use the existing name.
      3. Return JSON ONLY. Format: {"customerName": string, "productName": string, "quantity": number, "variant": string}
      4. If unknown, leave fields as empty string or 0.
    `;

    const parts: any[] = [{ text: prompt }];
    
    if (input.text) parts.push({ text: `User Text: ${input.text}` });
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
    return null;
  }
};
