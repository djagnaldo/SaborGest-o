# Instruções de Geração do APK Android (Debug) — SaborGestão

O projeto já está 100% configurado com **Capacitor** para Android, com o projeto nativo estruturado na pasta `/android` e os recursos web sincronizados.

---

### Opção 1: Gerar o APK via Linha de Comando (Gradle)

Se você tem o **JDK (Java 17 ou 21)** e o **Android SDK** instalados no seu computador:

1. Abra o terminal na pasta do projeto:
```bash
# Sincroniza qualquer alteração recente
npm run cap:sync

# Acessa o diretório Android
cd android

# Concede permissão de execução ao gradlew (Linux/Mac)
chmod +x gradlew

# Compila o APK de depuração (Debug APK)
./gradlew assembleDebug
```
*No Windows (CMD ou PowerShell):*
```cmd
cd android
gradlew.bat assembleDebug
```

2. O arquivo APK pronto para instalação será gerado em:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

3. Transfira o arquivo `app-debug.apk` para o celular via USB, WhatsApp ou Google Drive e toque nele para instalar (permitindo a instalação de fontes desconhecidas).

---

### Opção 2: Gerar ou Depurar no Android Studio

1. Abra o projeto no Android Studio com o comando:
```bash
npm run cap:open
```
*Ou abra o Android Studio manualmente e selecione a pasta `android` deste projeto.*

2. Aguarde a sincronização do Gradle.
3. No menu superior, clique em **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
4. Quando a notificação aparecer no canto inferior direito, clique em **locate** para acessar o arquivo `app-debug.apk`.

---

### Opção 3: Teste Imediato no Celular pelo Navegador (PWA / Web Mobile)

Enquanto você gera o APK, você pode testar imediatamente no seu celular pelo navegador:
- Acesse a URL do aplicativo no navegador do celular (Chrome / Firefox):
- A interface detectará automaticamente o tamanho da tela e ativará a **barra de navegação inferior**, alternância entre **Catálogo** e **Pedido**, e botões grandes de toque.
- No Chrome do Android, você pode tocar no menu `⋮` > **"Adicionar à tela inicial"** ou **"Instalar aplicativo"** para testá-lo como um app nativo em tela cheia.
