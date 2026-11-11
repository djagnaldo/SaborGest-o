/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilitário para captura, recorte e compressão local de fotografias de produtos.
 * Reduz a imagem para tamanho compacto (máx. 600x600 px) para otimizar armazenamento
 * no banco SQLite local e acelerar a distribuição via rede Wi-Fi/Hotspot local.
 */

export interface ProcessedImageResult {
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  width: number;
  height: number;
  format: string;
}

export async function processProductImage(
  file: File,
  maxWidth = 600,
  maxHeight = 600,
  quality = 0.82
): Promise<ProcessedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler arquivo da imagem'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagem inválido'));
      img.onload = () => {
        // Calcula dimensões mantendo proporção (fit)
        let targetWidth = img.width;
        let targetHeight = img.height;

        if (targetWidth > maxWidth || targetHeight > maxHeight) {
          const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
          targetWidth = Math.round(targetWidth * ratio);
          targetHeight = Math.round(targetHeight * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Contexto 2D do Canvas indisponível'));
          return;
        }

        // Desenha com suavização de alta qualidade
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Tenta WebP para compressão máxima, senão JPEG
        let dataUrl: string;
        let format = 'image/webp';
        try {
          dataUrl = canvas.toDataURL('image/webp', quality);
          if (!dataUrl.startsWith('data:image/webp')) {
            format = 'image/jpeg';
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
        } catch {
          format = 'image/jpeg';
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        const compressedSizeBytes = Math.round((dataUrl.length * 3) / 4);

        resolve({
          dataUrl,
          originalSizeBytes: file.size,
          compressedSizeBytes,
          width: targetWidth,
          height: targetHeight,
          format,
        });
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

// Catálogo de imagens pré-otimizadas da culinária brasileira para sugestão visual
export const PRESET_FOOD_PHOTOS = [
  {
    name: 'Hambúrguer Artesanal Smash',
    category: 'Lanches',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Batata Frita Rústica Crocante',
    category: 'Porções',
    url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Chopp Artesanal IPA Gelado',
    category: 'Bebidas',
    url: 'https://images.unsplash.com/photo-1608270146747-0b1a030c6a51?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Refrigerante em Lata com Gelo',
    category: 'Bebidas',
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Pizza de Calabresa Artesanal',
    category: 'Pizzas',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Cheesecake de Frutas Vermelhas',
    category: 'Sobremesas',
    url: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Porção de Pastel Crocante',
    category: 'Porções',
    url: 'https://images.unsplash.com/photo-1628294895950-9805252327bc?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Suco Natural da Fruta',
    category: 'Bebidas',
    url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=600&auto=format&fit=crop&q=80',
  },
];

// Fotografias de comprovante pré-definidas para testes rápidos de PIX e Dinheiro
export const PRESET_RECEIPT_PHOTOS = [
  {
    type: 'pix' as const,
    name: 'Comprovante PIX (App Bancário)',
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
    description: 'Captura de tela de transferência bancária instantânea PIX',
  },
  {
    type: 'cash' as const,
    name: 'Fotografia de Cédulas (Dinheiro Físico)',
    url: 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=600&auto=format&fit=crop&q=80',
    description: 'Registro fotográfico das cédulas recebidas em espécie',
  },
];
