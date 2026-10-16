import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Política de privacidad · Rentavle", alternates: { canonical: "/privacidad" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidad" updated="15 de octubre de 2026" draft>
      <h2>1. Quiénes somos</h2>
      <p>
        Rentavle presta un servicio de software para inmobiliarias. Respecto de los datos de las cuentas (usuarios de la inmobiliaria) somos
        responsables del tratamiento; respecto de los datos de los clientes que cada inmobiliaria carga (propietarios, inquilinos, garantes),
        actuamos como encargados del tratamiento por cuenta de la inmobiliaria.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>De los usuarios: nombre, email, teléfono, y datos de la inmobiliaria (razón social, CUIT, domicilio).</li>
        <li>De los clientes de la inmobiliaria: los que ella carga, por ejemplo nombre, documento, CUIT, contactos, domicilio y datos de contratos y pagos.</li>
        <li>Datos técnicos: registros de acceso y de uso necesarios para la seguridad y el funcionamiento del servicio.</li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Prestar el servicio: calcular, emitir documentos y enviar las comunicaciones que la inmobiliaria configura.</li>
        <li>Cobrar la suscripción, a través de MercadoPago (no guardamos datos de tarjetas).</li>
        <li>Dar soporte y avisarte cambios importantes del servicio.</li>
      </ul>
      <p>No vendemos datos ni los usamos para publicidad de terceros.</p>

      <h2>4. Con quién los compartimos</h2>
      <p>
        Solo con proveedores necesarios para el servicio: alojamiento y base de datos (Supabase), envío de emails (Resend) y cobros (MercadoPago).
        Pueden almacenarse en servidores fuera de la Argentina, con medidas de seguridad adecuadas.
      </p>

      <h2>5. Seguridad</h2>
      <p>
        Cada inmobiliaria está aislada de las demás a nivel de base de datos, las conexiones van cifradas, los links públicos de documentos vencen
        y se hacen copias de seguridad diarias.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Podés pedir acceso, rectificación o supresión de tus datos escribiendo a{" "}
        <a href="mailto:hola@rentavle.com" className="underline">
          hola@rentavle.com
        </a>
        . Los clientes de una inmobiliaria pueden ejercerlos ante esa inmobiliaria. La Agencia de Acceso a la Información Pública, órgano de control
        de la Ley 25.326, atiende denuncias y reclamos por incumplimientos.
      </p>

      <h2>7. Conservación</h2>
      <p>
        Conservamos los datos mientras la cuenta esté activa y hasta 90 días después de su cancelación, salvo obligación legal de guardarlos más
        tiempo. La inmobiliaria puede exportar todos sus datos en cualquier momento.
      </p>
    </LegalPage>
  );
}
