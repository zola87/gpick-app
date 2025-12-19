

import { GoogleGenAI } from "@google/genai";
import { Product, Order, Customer, GlobalSettings } from "../types";

// Helper to initialize GoogleGenAI strictly from process.env.API_KEY
const getGeminiClient = () => {
  if (!process.env.API_KEY) throw new Error("API Key is missing");
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Internal helper to calculate stats
const calculateStats = (products: Product[], orders: Order[], customers: Customer[]) => {
    // 1. Calculate Stats per Product
    const productStats = products.map(p => {
        const pOrders = orders.filter(o => o.productId === p.id);
        // CHANGED: Use quantityBought
        const qty = pOrders.reduce((sum, o) => sum + (o.quantityBought || 0), 0);
        const revenue = p.priceTWD * qty;
        return { name: p.name, qty, revenue, category: p.category, brand: p.brand };
    }).filter(p => p.qty > 0);

    // 2. Calculate Stats per Customer
    const customerStats = customers.map(c => {
        const cOrders = orders.filter(o => o.customerId === c.id);
        const spent = cOrders.reduce((sum, o) => {
            const p = products.find(prod => prod.id === o.productId);
            // CHANGED: Use quantityBought
            return sum + (p ? p.priceTWD * (o.quantityBought || 0) : 0);
        }, 0);
        return { name: c.lineName, spent, count: cOrders.filter(o => (o.quantityBought || 0) > 0).length };
    }).filter(c => c.spent > 0);

    const totalRevenue = productStats.reduce((sum, p) => sum + p.revenue, 0);
    const activeCustomerCount = customerStats.length;
    const aov = activeCustomerCount > 0 ? Math.round(totalRevenue / activeCustomerCount) : 0;

    return {
        totalRevenue,
        totalOrders: orders.filter(o => (o.quantityBought || 0) > 0).length,
        activeCustomers: activeCustomerCount,
        averageOrderValue: aov,
        topSellingByQty: productStats.sort((a,b) => b.qty - a.qty).slice(0, 10),
        topSellingByRevenue: productStats.sort((a,b) => b.revenue - a.revenue).slice(0, 10),
        topCustomers: customerStats.sort((a,b) => b.spent - a.spent).slice(0, 10),
        categoryDistribution: [...new Set(products.map(p => p.category))].map(cat => ({
            category: cat,
            revenue: productStats.filter(p => p.category === cat).reduce((sum, p) => sum + p.revenue, 0),
            qty: productStats.filter(p => p.category === cat).reduce((sum, p) => sum + p.qty, 0)
        })),
        brandDistribution: [...new Set(products.map(p => p.brand).filter(Boolean))].map(brand => ({
            brand: brand!,
            revenue: productStats.filter(p => p.brand === brand).reduce((sum, p) => sum + p.revenue, 0),
            qty: productStats.filter(p => p.brand === brand).reduce((sum, p) => sum + p.qty, 0)
        })).sort((a, b) => b.qty - a.qty).slice(0, 8)
    };
};

export const analyzeSalesData = async (
  products: Product[],
  orders: Order[],
  customers: Customer[]
): Promise<string> => {
  try {
    const ai = getGeminiClient();
    const dataSummary = calculateStats(products, orders, customers);

    const prompt = `
      我是一個日本代購賣家。請擔任我的「首席營運長」，根據以下深度銷售數據進行商業分析：
      
      【本場連線數據摘要】
      ${JSON.stringify(dataSummary, null, 2)}
      
      請提供一份專業且犀利的分析報告（繁體中文），包含以下四點：
      
      1. 💰 **營收結構分析**：
         - 點評「吸金商品」(Revenue Top) 與「熱銷商品」(Qty Top) 的差異。
         - 我們的客單價 (AOV) 為 $${dataSummary.averageOrderValue}，這算高還是低？給予選品定價建議。
      
      2. 👥 **客群經營策略**：
         - 針對本場的前幾名 VVIP 金主，給予具體的維繫建議（例如送什麼禮物或開什麼團）。
         - 如何提升客單價？
      
      3. 📈 **下次連線佈局**：
         - 根據類別營收表現，下次該多找什麼？少找什麼？
         - 建議開發的高毛利潛力商品。
      
      4. 💡 **一句話總結**：給老闆的一個核心行動呼籲。
      
      語氣請專業、鼓勵，並帶有商業洞察力。
    `;

    // Always use ai.models.generateContent for querying models
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });

    // Access the .text property directly from GenerateContentResponse
    return response.text || "無法生成分析報告。";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI 分析服務目前無法使用，請確認 API Key 是否設定正確。";
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

    // Always use ai.models.generateContent with appropriate model and responseMimeType
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    // Access the .text property directly from GenerateContentResponse
    const text = response.text;
    if (!text) return null;
    return JSON.parse(text);

  } catch (error) {
    console.error("Smart Parse Error", error);
    return null;
  }
};

// New function to generate a rich text prompt for external AI
export const generateAnalysisPrompt = (
  products: Product[],
  orders: Order[],
  customers: Customer[],
  settings: GlobalSettings
): string => {
    const stats = calculateStats(products, orders, customers);
    
    return `我是一個日本代購賣家，以下是我本次連線的詳細銷售數據。請擔任我的「首席營運長」，為我進行深度的商業分析與策略建議。

【💰 營運概況】
- 總營收: NT$ ${stats.totalRevenue.toLocaleString()}
- 總訂單數: ${stats.totalOrders} 筆
- 活躍客群: ${stats.activeCustomers} 人
- 平均客單價 (AOV): NT$ ${stats.averageOrderValue.toLocaleString()}

【🔥 熱銷商品 TOP 10 (按銷量)】
${stats.topSellingByQty.map((p, i) => `${i+1}. ${p.name} (${p.category}) - ${p.qty}件 / 營收$${p.revenue.toLocaleString()}`).join('\n')}

【💎 吸金商品 TOP 10 (按營收)】
${stats.topSellingByRevenue.map((p, i) => `${i+1}. ${p.name} - $${p.revenue.toLocaleString()} (銷量${p.qty})`).join('\n')}

【👑 VVIP 顧客排行】
${stats.topCustomers.map((c, i) => `${i+1}. ${c.name} - 消費 $${c.spent.toLocaleString()} (${c.count}單)`).join('\n')}

【📊 類別表現】
${stats.categoryDistribution.map(c => `- ${c.category}: $${c.revenue.toLocaleString()} (${c.qty}件)`).join('\n')}

【🏷️ 品牌表現 (Top 8)】
${stats.brandDistribution.map(b => `- ${b.brand}: $${b.revenue.toLocaleString()} (${b.qty}件)`).join('\n')}

【🧠 請深度分析並回答】
1. **利利润結構診斷**：我的商品結構健康嗎？有沒有「賺了營收賠了毛利」的狀況？
2. **客群洞察**：針對這幾位 VVIP，我有什麼方法可以讓他們下一場買更多？如何喚醒低客單價的客人？
3. **選品策略**：根據這次的品牌與類別數據，下次去日本我應該專攻什麼？放棄什麼？
4. **定價建議**：我的 AOV 是 $${stats.averageOrderValue}，是否需要調整定價策略或推出組合包？
5. **行動呼籲**：請給我三個立刻可以執行的具體建議。

請用專業、直言不諱但具建設性的語氣回答。`;
};