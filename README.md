# 🛡️ ProtectID - Privacidad Local & Segura para tu DNI

ProtectID es una aplicación web local de última generación diseñada para censurar, proteger y añadir marcas de agua a copias digitales de tu DNI, pasaporte o documento de identidad antes de enviarlo por internet. 

La herramienta combina una interfaz de usuario premium, fluida e interactiva con una arquitectura de seguridad implacable: **el 100% del procesamiento de imagen ocurre dentro de tu propio navegador.**

---

## 🔒 100% Privacidad Local (Auditoría de Seguridad)

Para garantizar la absoluta confidencialidad de tus documentos personales, ProtectID ha sido auditado para asegurar que cumple con un enfoque de **cero transferencia de datos**:
* **Procesamiento Local Extremo:** El archivo de imagen se carga en la memoria del navegador local usando URLs de objeto temporal (`URL.createObjectURL`). Ningún dato se almacena en la nube.
* **Manipulación de Pixeles Segura:** Todo el renderizado, la aplicación de filtros en blanco y negro, la superposición de marcas de agua dinámicas y los rectángulos de protección se calculan en un lienzo `<canvas>` interno en la GPU/CPU de tu dispositivo.
* **Cero Conexiones de Red:** La aplicación no realiza llamadas a APIs externas, ni `fetch()`, ni `XMLHttpRequest`, ni cuenta con scripts de telemetría de terceros. **Tus documentos de identidad jamás abandonarán este dispositivo.**

---

## ✨ Características Principales

### 📱 1. Interfaz Premium Optimizada para Móvil y Táctil
* **Manejadores Táctiles Inteligentes:** En la mayoría de herramientas, los puntos de edición se dibujan basados en los píxeles de la imagen. En fotos de alta resolución (ej. 2000px), los puntos se vuelven microscópicos en pantallas móviles. ProtectID calcula dinámicamente el factor de escala de la pantalla y dibuja manejadores de **tamaño CSS constante (20px de radio táctil)** para que mover, rotar o redimensionar con el dedo sea sumamente fácil y cómodo.
* **Inserción Segura (`+ Añadir Cuadro`):** Un botón dedicado permite insertar un rectángulo de protección en el centro del canvas de forma instantánea. Esto evita la molestia de tener que arrastrar el dedo "a ciegas" tapando la pantalla táctil y elimina el conflicto con el scroll vertical nativo del móvil.
* **Scroll Inteligente:** El scroll del navegador solo se bloquea cuando se está manipulando un elemento de censura activo. Si tocas el fondo, podrás desplazarte por la página de forma fluida.

### 📐 2. Matemáticas de Redimensionado Rotado Perfecto
* Cuenta con un sofisticado **algoritmo de redimensionado basado en punto opuesto fijo**. Cuando redimensionas un rectángulo de censura rotado en cualquier ángulo y desde cualquiera de sus 4 esquinas (`superior-izquierda`, `inferior-derecha`, etc.), el algoritmo fija geométricamente el vértice opuesto en el espacio bidimensional. Esto evita saltos bruscos y deformaciones, brindando una experiencia de diseño profesional al nivel de software de edición vectorial como Figma.

### 🌊 3. Marca de Agua Dinámica en Onda
* Permite superponer un texto personalizado de forma repetitiva con un formato de párrafo continuo.
* **Controles Precisos:** Sliders para controlar la opacidad, el ángulo de inclinación, el tamaño de la tipografía, el espaciado de línea y la amplitud de la onda sinusoidal (creando un efecto de marca de agua curvada que dificulta enormemente su borrado digital por parte de terceros).
* **Paleta de Colores Curada:** Selección rápida de colores modernos optimizados para destacar o integrarse sutilmente en el fondo del documento.

### 🗑️ 4. Edición Ágil y Borrado Individual
* Los rectángulos protectores pueden seleccionarse individualmente haciendo clic o pulsándolos.
* El botón **"Eliminar"** (rojo sutil) aparece de forma reactiva únicamente cuando hay un elemento seleccionado.
* **Accesos Rápidos:** En computadoras de escritorio, puedes presionar las teclas `Delete` (Suprimir) o `Backspace` (Retroceso) para eliminar instantáneamente el cuadro que tengas seleccionado.

### ◐ 5. Filtro Blanco y Negro
* Aplica una escala de grises de alta fidelidad al DNI. Esto unifica la apariencia del documento, resalta las áreas negras de protección y previene que se analicen variaciones de color originales de la tarjeta de identidad.

---

## 🛠️ Tecnologías Utilizadas

ProtectID está construido utilizando un stack ligero de alto rendimiento y libre de dependencias pesadas:
1. **HTML5 Semántico** para la estructura de la aplicación y la accesibilidad.
2. **CSS3 Moderno** utilizando variables CSS, efectos de desenfoque de fondo (`backdrop-filter`) para dar un acabado translúcido (Glassmorphism), gradientes armónicos y animaciones sutiles.
3. **Vanilla JavaScript (ES6+)** para la gestión matemática de matrices, gestos táctiles complejos, eventos de renderizado interactivo en Canvas (`requestAnimationFrame`) y control del DOM.

---

## 🚀 Despliegue en GitHub Pages

Subir y alojar este proyecto de forma gratuita para que cargue automáticamente en la web con **GitHub Pages** es extremadamente sencillo:

1. Crea este repositorio en tu cuenta de GitHub (ej. `https://github.com/wilberzero/ProtectID`).
2. Sube todos los archivos del proyecto a la rama principal (`main`).
3. Ve a la pestaña **Settings** (Configuración) de tu repositorio en GitHub.
4. En el menú de la izquierda, haz clic en **Pages**.
5. En la sección **Build and deployment**, bajo **Source**, selecciona `Deploy from a branch`.
6. En **Branch**, selecciona la rama `main` y la carpeta `/ (root)`, luego haz clic en **Save** (Guardar).
7. ¡Listo! En un par de minutos, GitHub te proporcionará un enlace público (ej. `https://wilberzero.github.io/ProtectID/`) donde podrás acceder y usar tu herramienta de forma segura desde cualquier parte del mundo.

---

*Desarrollado con pasión por la privacidad individual y el diseño de interfaces moderno.*