import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Términos y condiciones · Rentavle", alternates: { canonical: "/terminos" } };

export default function TermsPage() {
  return (
    <LegalPage title="Términos y condiciones" updated="15 de octubre de 2026" draft>
      <h2>1. Qué es Rentavle</h2>
      <p>
        Rentavle es un software en línea para que inmobiliarias administren alquileres: contratos, actualizaciones de monto, deudas, cobros,
        liquidaciones a propietarios, caja y comunicaciones. Lo usás a través de una cuenta de tu inmobiliaria.
      </p>

      <h2>2. Cuenta y usuarios</h2>
      <ul>
        <li>Para crear la cuenta tenés que ser mayor de edad y tener facultades para representar a la inmobiliaria.</li>
        <li>Sos responsable de los usuarios que invitás y de mantener sus contraseñas en secreto.</li>
        <li>Cada inmobiliaria puede usar una sola prueba gratuita (por CUIT).</li>
      </ul>

      <h2>3. Prueba gratis y planes</h2>
      <ul>
        <li>La prueba dura 21 días e incluye hasta 10 contratos activos. No requiere medio de pago.</li>
        <li>Los planes se cobran por adelantado (mensual o anual) con débito automático de MercadoPago, según la cantidad de contratos activos.</li>
        <li>Los precios se ajustan cada tres meses por inflación; te avisamos con 30 días de anticipación.</li>
        <li>Podés cancelar cuando quieras desde Suscripción. No hay reintegros por períodos ya cobrados.</li>
      </ul>

      <h2>4. Cuenta en solo lectura</h2>
      <p>
        Si termina la prueba sin elegir un plan, o la suscripción se cancela o no se puede cobrar, la cuenta queda en solo lectura: podés ver y
        exportar todo, pero no cargar datos nuevos. Conservamos tus datos al menos 90 días; después podemos eliminarlos previo aviso.
      </p>

      <h2>5. Tus datos</h2>
      <p>
        Los datos que cargás (clientes, contratos, movimientos) son de tu inmobiliaria. Los tratamos solo para prestarte el servicio, según la{" "}
        <a href="/privacidad" className="underline">
          Política de privacidad
        </a>
        . Sos responsable de contar con autorización para cargar los datos personales de tus clientes y para enviarles comunicaciones.
      </p>

      <h2>6. Cálculos y responsabilidad</h2>
      <p>
        Rentavle calcula aumentos, punitorios, honorarios y liquidaciones según los datos y condiciones que cargás, y muestra cada cálculo para que
        puedas revisarlo. Los índices se toman de fuentes oficiales (INDEC, BCRA) y pueden tener demoras o correcciones. Verificá los importes
        antes de cobrar o liquidar: Rentavle no reemplaza el asesoramiento contable ni legal.
      </p>

      <h2>7. Disponibilidad</h2>
      <p>
        Hacemos lo posible para que el servicio esté disponible siempre, con copias de seguridad diarias, pero puede haber interrupciones por
        mantenimiento o causas ajenas a nosotros.
      </p>

      <h2>8. Uso aceptable</h2>
      <p>No podés usar Rentavle para actividades ilegales, enviar comunicaciones no solicitadas ni intentar acceder a datos de otras inmobiliarias.</p>

      <h2>9. Cambios y contacto</h2>
      <p>
        Podemos actualizar estos términos; los cambios importantes se avisan por email con anticipación. Consultas:{" "}
        <a href="mailto:hola@rentavle.com" className="underline">
          hola@rentavle.com
        </a>
        . Se aplica la ley de la República Argentina.
      </p>
    </LegalPage>
  );
}
