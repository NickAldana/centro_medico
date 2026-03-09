# 🏥 Sistema Médico Web - Gestión Administrativa Integral

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)

Un sistema de información web completo para la gestión administrativa de centros médicos, desarrollado con Node.js, Express y Oracle (Oracle Database / oracledb), normalizado a 3FN y optimizado para el contexto boliviano.

## ✨ Características Principales

### 🎯 Módulos Completos
- **Gestión de Usuarios y Roles**: Sistema RBAC con 7 roles predefinidos
- **Gestión de Pacientes**: Registro completo con historial médico
- **Agendamiento de Citas**: Calendarización inteligente con disponibilidad en tiempo real
- **Control de Inventario**: Gestión de medicamentos con alertas de stock
- **Facturación y Caja**: Sistema completo con múltiples métodos de pago
- **Reportes y Estadísticas**: Dashboard interactivo con KPIs en tiempo real
- **Configuración y Seguridad**: Gestión centralizada con auditoría completa

### 🔧 Características Técnicas
	- **Base de Datos**: Oracle Database (malha con scripts en `scripts/init-database-oracle.js`) normalizada a 3FN
- **Moneda**: Bolivianos (BOB) con IVA configurable
- **Autenticación**: JWT con refresh tokens
- **Seguridad**: Rate limiting, cifrado AES, cumplimiento Ley N.º 164
- **Auditoría**: Registro completo de todas las acciones
- **API RESTful**: Endpoints completos con documentación
- **Frontend Responsive**: HTML5, CSS3, JavaScript vanilla

## 🚀 Quick Start

### Prerrequisitos
- Node.js 18+ 
- npm 8+
- Visual Studio Code (recomendado)

### Instalación Rápida

```bash
# 1. Clonar el repositorio
git clone <repository-url>
cd sistema-medico

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tu configuración

# 4. Inicializar base de datos
npm run init-db

# 5. Iniciar sistema
npm run dev
```

### Acceso
- **Frontend**: http://localhost:8080
- **API**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health

### Usuarios Predeterminados
| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | admin@centromedico.com | admin123 |
| Director | director@centromedico.com | admin123 |
| Médico | c.martinez@centromedico.com | admin123 |
| Cajero | r.vargas@centromedico.com | admin123 |

## 📁 Estructura del Proyecto

```
sistema-medico/
├── backend/                 # 🚀 Backend Node.js
│   └── src/
│       ├── app.js          # Aplicación principal
│       ├── middleware/     # Autenticación, auditoría
│       ├── routes/         # API RESTful
│       └── utils/          # Utilidades
├── frontend/               # 🎨 Frontend Web
│   ├── assets/
│   │   ├── css/           # Estilos responsivos
│   │   └── js/            # JavaScript vanilla
│   └── pages/             # Páginas HTML
├── database/              # 🗄️ Base de Datos
│   ├── schemas/           # Esquemas SQL (3FN)
│   └── seeds/             # Datos iniciales
├── scripts/               # 🛠️ Scripts útiles
└── docs/                  # 📚 Documentación
```

## 🏗️ Arquitectura

### Base de Datos (3FN)
```
📊 configuracion_sistema
👥 usuarios ─── roles ─── permisos
🏥 pacientes ─── citas ─── facturas ─── detalle_factura
💊 categorías ─── productos ─── inventario ─── movimientos_inventario
📋 bitácora_accesos
```

### API Endpoints

```javascript
// Autenticación
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh-token

// Usuarios
GET    /api/usuarios
POST   /api/usuarios
PUT    /api/usuarios/:id
DELETE /api/usuarios/:id

// Pacientes
GET    /api/pacientes
POST   /api/pacientes
PUT    /api/pacientes/:id
GET    /api/pacientes/:id/historial

// Citas
GET    /api/citas
POST   /api/citas
PUT    /api/citas/:id
GET    /api/citas/calendar/:date

// Inventario
GET    /api/inventario/productos
POST   /api/inventario/movimiento
GET    /api/inventario/alertas

// Facturación
GET    /api/facturacion/facturas
POST   /api/facturacion/facturas
GET    /api/facturacion/caja

// Reportes
GET    /api/reportes/dashboard
GET    /api/reportes/financieros
POST   /api/reportes/export
```

## 🎯 Módulos Detallados

### 1. Gestión de Usuarios y Roles
- **RBAC**: Role-Based Access Control con 7 niveles
- **Seguridad**: Bloqueo automático por intentos fallidos
- **Auditoría**: Registro completo de accesos y acciones
- **Permisos**: Control granular por módulo y función

### 2. Gestión de Pacientes
- **Registro**: Datos completos con antecedentes médicos
- **Historial**: Seguimiento completo de tratamientos
- **Contactos**: Información de emergencia y seguros
- **Exportación**: Generación de PDFs y listados

### 3. Agendamiento de Citas
- **Calendario**: Vista mensual/semanal/diaria
- **Disponibilidad**: Actualización en tiempo real
- **Recordatorios**: Notificaciones automáticas
- **Estados**: Programada, confirmada, atendida, cancelada

### 4. Control de Inventario
- **Productos**: Medicamentos e insumos médicos
- **Stock**: Control con alertas de bajo stock
- **Lotes**: Gestión por lotes y fechas de vencimiento
- **Movimientos**: Entrada, salida, ajuste con trazabilidad

### 5. Facturación y Caja
- **Facturas**: Emisión electrónica con IVA
- **Pagos**: Efectivo, tarjeta, transferencia, seguro
- **Reportes**: Cierre diario, mensual, por período
- **Integración**: Automático desde citas atendidas

### 6. Reportes y Estadísticas
- **Dashboard**: KPIs en tiempo real
- **Gráficos**: Evolución de ingresos, citas, servicios
- **Exportación**: PDF y Excel
- **Filtros**: Por fecha, área, especialidad, médico

### 7. Configuración y Seguridad
- **Institucional**: Nombre, logo, horarios, impuestos
- **Backup**: Automático programable
- **Logs**: Auditoría completa del sistema
- **Seguridad**: HTTPS, cifrado, control de acceso

## 🔒 Seguridad

### Implementaciones
- ✅ **JWT**: Tokens con expiración y refresh
- ✅ **Rate Limiting**: Protección contra ataques
- ✅ **Cifrado**: Contraseñas con bcrypt (12 rounds)
- ✅ **HTTPS**: Configuración SSL/TLS
- ✅ **CORS**: Configuración restrictiva
- ✅ **Input Validation**: Sanitización de datos
- ✅ **SQL Injection**: Prepared statements
- ✅ **XSS Protection**: Headers de seguridad

### Cumplimiento Normativo
- 🇧🇴 **Ley N.º 164**: Protección de Datos Personales
- 🔐 **ISO 27001**: Mejores prácticas de seguridad
- 📋 **Leyes de Salud**: Cumplimiento normativo médico

## 📊 Estadísticas y Métricas

### KPIs del Dashboard
- 📈 **Productividad**: Citas atendidas vs programadas
- 💰 **Ingresos**: Evolución mensual y anual
- 👥 **Pacientes**: Nuevos vs recurrentes
- 💊 **Inventario**: Rotación y valorización
- ⭐ **Servicios Top**: Más solicitados y rentables

### Reportes Disponibles
- 📋 **Financieros**: Ingresos, costos, rentabilidad
- 📅 **Citas**: Atención por médico/especialidad
- 💊 **Inventario**: Consumo, rotación, vencimiento
- 👥 **Pacientes**: Demografía, seguros, frecuencia

## 🛠️ Desarrollo

### Scripts Disponibles
```bash
npm start              # Modo producción
npm run dev            # Modo desarrollo
npm run serve-frontend # Servidor frontend
npm run init-db        # Inicializar base de datos
npm test               # Ejecutar pruebas
```

### Estructura de Archivos
- **Backend**: Node.js + Express + Oracle (oracledb)
- **Frontend**: HTML5 + CSS3 + JavaScript vanilla
- **Database**: Oracle Database con normalización 3FN
- **Security**: JWT + bcrypt + helmet
- **Testing**: Jest + supertest

### Configuración VS Code
Consulte [MANUAL_VSCODE.md](MANUAL_VSCODE.md) para guía completa de desarrollo.

## 📦 Despliegue

### Opciones de Despliegue
1. **Local**: npm start
2. **Docker**: docker-compose up
3. **Cloud**: Heroku, AWS, Azure
4. **Dedicado**: PM2 + nginx

### Variables de Entorno
```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=tu_secreto_super_seguro
DB_USER=/tu_usuario_oracle
DB_PASSWORD=/tu_password_oracle
DB_CONNECTION_STRING=localhost:1521/XEPDB1
```

## 🤝 Contribución

### Flujo de Trabajo
1. Fork del repositorio
2. Crear feature branch
3. Commits con mensajes claros
4. Pull request con descripción

### Estándares de Código
- **JavaScript**: ES6+ con ESLint
- **CSS**: BEM methodology
- **Commits**: Conventional Commits
- **Docs**: Markdown estándar

## 📞 Soporte

### Documentación
- 📖 [Manual VS Code](MANUAL_VSCODE.md) - Guía completa
- 🔧 [API Documentation](docs/api.md) - Endpoints
- 🗄️ [Database Schema](docs/database.md) - Esquema BD
- 🔒 [Security Guide](docs/security.md) - Seguridad

### Contacto
- 📧 Email: soporte@centromedico.com
- 🐛 Issues: GitHub Issues
- 💬 Discord: Canal de soporte

## 📜 Licencia

Este proyecto está licenciado bajo la **MIT License** - ver archivo [LICENSE](LICENSE) para detalles.

---

## 🎉 Agradecimientos

- Al equipo de desarrollo por su dedicación
- A los centros médicos piloto por su feedback
- A la comunidad de código abierto

---

**¡Gracias por usar el Sistema Médico Web!** 🏥

*Desarrollado con ❤️ para mejorar la gestión de salud en Bolivia*