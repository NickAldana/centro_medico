-- Migración: Soporte para pagos divididos (múltiples métodos por factura)
-- Ejecutar en Oracle: @migrate-pagos-factura.sql

-- Tabla de pagos por factura (una factura puede tener varios pagos)
BEGIN
  EXECUTE IMMEDIATE '
    CREATE TABLE pagos_factura (
      id_pago NUMBER PRIMARY KEY,
      id_factura NUMBER NOT NULL,
      metodo_pago VARCHAR2(50),
      monto NUMBER(10,2),
      referencia_pago VARCHAR2(100),
      CONSTRAINT fk_pagofac_fac FOREIGN KEY (id_factura) REFERENCES facturas(id_factura) ON DELETE CASCADE
    )';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; -- Tabla ya existe
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE SEQUENCE seq_pago START WITH 1 INCREMENT BY 1 NOCACHE';
EXCEPTION
  WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;
END;
/
