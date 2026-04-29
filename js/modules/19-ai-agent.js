/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/19-ai-agent.js
 *   @brief      Asistente AI litúrgico (consulta a Gemini con contexto del cancionero)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.35
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   19-ai-agent.js
   ============================================================================
   Asistente AI — chip de búsqueda inteligente con Gemini

   Llama a Gemini API para sugerencias de cantos según contexto litúrgico.

   ORDEN DE CARGA: posición 19 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

/* ── AI Agent ── */
var _ai={h:[],p:false};
function _gk(){var a=['QUl6YVN5QV9ON','01lTTRrenQ5cE','EyQnRyNDdrT2J','rTWpCRWFyd1dr'];return atob(a.join(''));}

var AI_CATALOG=`• Desde el Alba hasta el Ocaso [Entrada] — Compositor: Mite Balduzzi — Versículo: «Oh Dios, Tú eres mi Dios, desde la aurora Te busco; mi alma está sedienta de Ti; mi carne tiene ansia de Ti, como tierra reseca, agostada, sin agua» — Sal 63,2 — Tiempos: Entrada, Adoración eucarística, Todo el Año Litúrgico\n• Dios Trino [Entrada] — Compositor: Paullo Roberto — Versículo: «Id y haced discípulos a todas las naciones, bautizándolos en el nombre del Padre, del Hijo y del Espíritu Santo» — Mt 28,19 — Tiempos: Entrada, Santísima Trinidad, Ordinario\n• El Pueblo de Dios [Entrada] — Compositor: Éxodo — Versículo: «Recuerda todo el camino que el Señor tu Dios te ha hecho recorrer estos cuarenta años por el desierto, para humillarte, probarte y conocer tus intenciones» — Dt 8,2 — Tiempos: Entrada, Ordinario, Cuaresma, Pascua\n• Hacia Ti Morada Santa [Entrada] — Compositor: Kiko Argüello — Versículo: «El que come mi carne y bebe mi sangre tiene vida eterna, y yo lo resucitaré en el último día» — Jn 6,54 — Tiempos: Entrada, Procesión eucarística, Corpus Christi, Cuaresma, Ordinario\n• Maranatha [Entrada] — Compositor: Marco López — Versículo: «El que da testimonio de estas cosas dice: Sí, vengo pronto. ¡Amén! ¡Ven, Señor Jesús!» — Ap 22,20 — Tiempos: Entrada, Adviento\n• Reunidos en el Nombre del Señor [Entrada] — Compositor: Francisco Palazón — Versículo: «Porque donde están dos o tres reunidos en mi nombre, allí estoy Yo en medio de ellos» — Mt 18,20 — Tiempos: Entrada, Todo el Año Litúrgico\n• Vosotros Sois de Dios [Entrada] — Compositor: Mite Balduzzi — Versículo: «Todo es vuestro: el mundo, la vida, la muerte, lo presente o lo futuro. Todo es vuestro, y vosotros sois de Cristo, y Cristo es de Dios» — 1 Cor 3,22-23 — Tiempos: Entrada, Acción de Gracias, Ordinario\n• Piedad Cantaré [Piedad] — Compositor: Cantaré — Versículo: «Señor, ten piedad de nosotros; en Ti hemos esperado» — Is 33,2 — Tiempos: Acto penitencial, Todo el Año Litúrgico\n• Nos Has Llamado al Desierto [Piedad] — Compositor: Bernardo Velado Graña — Versículo: «Por eso yo la voy a seducir, la llevaré al desierto y le hablaré al corazón» — Os 2,16 — Tiempos: Entrada, Salida, Cuaresma\n• Santa María de la Esperanza [Entrada] — Compositor: Rafael de Andrés — Versículo: «Y el Verbo se hizo carne y plantó su tienda entre nosotros» — Jn 1,14 — Tiempos: Entrada, Salida, Adviento, Fiestas marianas\n• Venimos a Ti [Entrada] — Compositor: Salmos de peregrinación — Versículo: «Venid a mí todos los que estáis cansados y agobiados, y yo os aliviaré» — Mt 11,28 — Tiempos: Entrada, Ordinario\n• Kyrie Eléison – CC Shalom [Piedad] — Compositor: Comunidad Católica Shalom — Versículo: «Señor, ten piedad de mí; sana mi alma, porque he pecado contra Ti» — Sal 41,5 — Tiempos: Acto penitencial, Todo el Año Litúrgico\n• Kyrie Eléison (Fiorella Berríos) [Piedad] — Compositor: Fiorella Berríos — Versículo: «Ten piedad de mí, oh Dios, en Tu misericordia; en Tu gran compasión, borra mi culpa» — Sal 51,3 — Tiempos: Acto penitencial, Todo el Año Litúrgico\n• Kyrie Eléison – M. Frisina [Piedad] — Compositor: Mons. Marco Frisina — Versículo: «Señor, ten piedad de mi hijo, que es epiléptico y sufre mucho» — Mt 17,15 — Tiempos: Acto penitencial, Todo el Año Litúrgico\n• Señor, Ten Piedad [Piedad] — Compositor: Grial — Versículo: «¡Ten piedad de mí, oh Señor, Hijo de David! Mi hija es cruelmente atormentada por un demonio» — Mt 15,22 — Tiempos: Acto penitencial, Todo el Año Litúrgico\n• Gloria (Giombini) [Gloria] — Compositor: Marcello Giombini — Versículo: «Gloria a Dios en las alturas, y en la tierra paz a los hombres que gozan de su amor» — Lc 2,14 — Tiempos: Gloria, Ordinario, Navidad, Pascua\n• Gloria en las Alturas [Gloria] — Versículo: «Gloria a Dios en las alturas, y en la tierra paz a los hombres que gozan de su amor» — Lc 2,14 — Tiempos: Gloria, Ordinario, Navidad, Pascua\n• Gloria – Palazón [Gloria] — Compositor: Francisco Palazón — Versículo: «Gloria a Dios en las alturas, y en la tierra paz a los hombres que gozan de su amor» — Lc 2,14 — Tiempos: Gloria, Ordinario, Navidad, Pascua\n• Gloria – Rioja [Gloria] — Compositor: Rioja — Versículo: «Gloria a Dios en las alturas, y en la tierra paz a los hombres que gozan de su amor» — Lc 2,14 — Tiempos: Gloria, Ordinario, Navidad, Pascua\n• Aleluya Cantaré [Aleluya] — Compositor: Cantaré — Versículo: «¡Aleluya! La salvación, la gloria y el poder son de nuestro Dios» — Ap 19,1 — Tiempos: Aclamación al Evangelio, Ordinario, Pascua, Navidad\n• Aleluya Irlandés [Aleluya] — Versículo: «Alabad al Señor, porque es bueno; porque es eterna Su misericordia» — Sal 136,1 — Tiempos: Aclamación al Evangelio, Ordinario, Pascua\n• Aleluya Solemne [Aleluya] — Versículo: «Alabad a Dios en Su santuario, alabadlo en Su poderoso firmamento. Alabadlo por Sus proezas, alabadlo por Su inmensa grandeza» — Sal 150,1-2 — Tiempos: Aclamación al Evangelio, Ordinario, Pascua, Solemnidades\n• Aleluya – Alabad al Señor [Aleluya] — Compositor: Hallel — Versículo: «Después de cantar los himnos, salieron hacia el Monte de los Olivos» — Mt 26,30 — Tiempos: Aclamación al Evangelio, Ordinario, Pascua\n• Aleluya – Verbum Panis [Aleluya] — Compositor: Mite Balduzzi — Versículo: «¡Aleluya! Alabad al Señor, porque es bueno, porque es eterna Su misericordia» — Sal 106,1 — Tiempos: Aclamación al Evangelio, Ordinario, Pascua\n• Todo el que Ama ha Nacido de Dios [Aleluya] — Compositor: Primera Carta de San Juan — Versículo: «Todo el que ama ha nacido de Dios y conoce a Dios. Quien no ama no ha conocido a Dios, porque Dios es amor» — 1 Jn 4,7-8 — Tiempos: Aclamación al Evangelio, Ordinario, Pascua\n• Gloria a Ti Oh Cristo [Aclamación del Evangelio] — Compositor: Evangelio es el corazón de la Liturgia de la Palabra — Versículo: «El cielo y la tierra pasarán, pero mis palabras no pasarán» — Mt 24,35 — Tiempos: Aclamación al Evangelio, Todo el Año Litúrgico\n• Como Lo Hizo María [Ofertorio] — Versículo: «He aquí la esclava del Señor; hágase en mí según Tu palabra» — Lc 1,38 — Tiempos: Ofertorio, Fiestas marianas, Todo el Año Litúrgico\n• Con Amor Te Presento, Señor [Ofertorio] — Compositor: Ofertorio — Versículo: «En verdad os digo que esta viuda pobre ha echado más que todos, porque todos han echado de lo que les sobraba; ella, en cambio, ha echado todo lo que tenía para vivir» — Mc 12,43-44 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Cristo Mío [Ofertorio] — Compositor: Ofertorio — Versículo: «Os exhorto, hermanos, por la misericordia de Dios, a que ofrezcáis vuestros cuerpos como sacrificio vivo, santo, agradable a Dios: este es vuestro culto racional» — Rom 12,1 — Tiempos: Ofertorio, Ordinario\n• El Alfarero [Ofertorio] — Compositor: Jeremías — Versículo: «Bajé a la casa del alfarero, y lo encontré trabajando en el torno. Y si la vasija que estaba haciendo se estropeaba, volvía a hacer otra» — Jr 18,3-4 — Tiempos: Ofertorio, Ordinario, Cuaresma\n• En su Mesa hay Amor [Ofertorio] — Compositor: Ofertorio — Versículo: «Yo os preparo un Reino, como mi Padre me lo preparó a mí, para que comáis y bebáis a mi mesa en mi Reino» — Lc 22,29-30 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Esto que Te Doy [Ofertorio] — Versículo: «Mientras comían, Jesús tomó pan, lo bendijo, lo partió y se lo dio diciendo: Tomad, esto es mi Cuerpo» — Mc 14,22 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Feliz Encuentro [Ofertorio] — Compositor: Hermana Inés de Jesús — Versículo: «Entonces se les abrieron los ojos y lo reconocieron al partir el pan» — Lc 24,31 — Tiempos: Ofertorio, Ordinario\n• Ofrenda de Amor [Ofertorio] — Versículo: «Aunque repartiera todos mis bienes y entregara mi cuerpo a las llamas, si no tengo amor, de nada me sirve» — 1 Cor 13,3 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Ofrenda Mariana [Ofertorio] — Tiempos: Ofertorio, Fiestas marianas, Todo el Año Litúrgico\n• Pan y Vino de Amor [Ofertorio] — Versículo: «Melquisedec, rey de Salem, presentó pan y vino, pues era sacerdote del Dios Altísimo, y lo bendijo» — Gn 14,18 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Por Amor [Ofertorio] — Compositor: Hermana Inés de Jesús — Versículo: «En esto consiste el amor: no en que nosotros hayamos amado a Dios, sino en que Él nos amó primero y envió a Su Hijo como víctima por nuestros pecados» — 1 Jn 4,10 — Tiempos: Ofertorio, Ordinario\n• Recíbeme [Ofertorio] — Versículo: «Aquí estoy, Señor, para hacer Tu voluntad» — Sal 40,8-9 (citado en Heb 10,7) — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Sobre tu Altar [Ofertorio] — Versículo: «Tenemos un altar del cual no tienen derecho a comer los que sirven al tabernáculo» — Heb 13,10 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Son Para Ti [Ofertorio] — Versículo: «Todo viene de Ti, y de lo Tuyo Te damos» — 1 Cr 29,14 — Tiempos: Ofertorio, Todo el Año Litúrgico, Ofertorio, Todo el Año\n• Te Consagro [Ofertorio] — Versículo: «Porque habéis sido comprados a gran precio. Glorificad, pues, a Dios en vuestro cuerpo» — 1 Cor 6,20 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Tomad Señor y Recibid [Ofertorio] — Compositor: «Suscipe» — Versículo: «Te basta mi gracia, porque mi fuerza se manifiesta en la debilidad» — 2 Cor 12,9 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Tuyo Soy [Ofertorio] — Versículo: «Si vivimos, para el Señor vivimos; si morimos, para el Señor morimos. Así que, ya vivamos, ya muramos, del Señor somos» — Rom 14,8 — Tiempos: Ofertorio, Ordinario\n• Tómame Señor – Jesed [Ofertorio] — Compositor: Jesed — Versículo: «Entonces dije: Aquí estoy, envíame a mí» — Is 6,8 — Tiempos: Ofertorio, Todo el Año Litúrgico\n• Sanctus – Verbum Panis [Santo] — Compositor: Mite Balduzzi — Versículo: «Santo, Santo, Santo es el Señor de los ejércitos; toda la tierra está llena de Su gloria» — Is 6,3 — Tiempos: Santo, Todo el Año Litúrgico\n• Santo – Alfonso Luna [Santo] — Compositor: Alfonso Luna — Versículo: «Santo, Santo, Santo es el Señor de los ejércitos; toda la tierra está llena de Su gloria» — Is 6,3 — Tiempos: Santo, Todo el Año Litúrgico\n• Santo – Fones [Santo] — Compositor: Cristóbal Fones S.J. — Versículo: «Santo, Santo, Santo es el Señor de los ejércitos; toda la tierra está llena de Su gloria» — Is 6,3 — Tiempos: Santo, Todo el Año Litúrgico\n• Santo – Frisina [Santo] — Compositor: Mons. Marco Frisina — Versículo: «¡Bendito el que viene en nombre del Señor! ¡Hosanna en las alturas!» — Mt 21,9 — Tiempos: Santo, Todo el Año Litúrgico, Solemnidades\n• Agnus Dei – Verbum Panis [Cordero de Dios] — Compositor: Mite Balduzzi — Versículo: «He ahí el Cordero de Dios, que quita el pecado del mundo» — Jn 1,29 — Tiempos: Cordero de Dios, Todo el Año Litúrgico\n• Cordero Piadoso [Cordero de Dios] — Compositor: Agnus Dei — Versículo: «El Señor es compasivo y misericordioso, lento a la ira y rico en clemencia» — Sal 103,8 — Tiempos: Cordero de Dios, Todo el Año Litúrgico\n• Cordero – Dynamis [Cordero de Dios] — Compositor: Dynamis — Versículo: «He ahí el Cordero de Dios, que quita el pecado del mundo» — Jn 1,29 — Tiempos: Cordero de Dios, Todo el Año Litúrgico\n• Cordero - Marco Frisina [Cordero de Dios] — Compositor: Mons. Marco Frisina — Versículo: «He ahí el Cordero de Dios, que quita el pecado del mundo» — Jn 1,29 — Tiempos: Cordero de Dios, Todo el Año Litúrgico\n• Cordero – Mejía [Cordero de Dios] — Compositor: Alejandro Mejía — Versículo: «He ahí el Cordero de Dios, que quita el pecado del mundo» — Jn 1,29 — Tiempos: Cordero de Dios, Todo el Año Litúrgico\n• Oh Cordero de Dios [Cordero de Dios] — Compositor: Agnus Dei — Versículo: «Digno es el Cordero que fue inmolado de recibir el poder, la riqueza, la sabiduría, la fuerza, el honor, la gloria y la alabanza» — Ap 5,12 — Tiempos: Cordero de Dios, Todo el Año Litúrgico\n• Alma de Cristo [Comunión] — Compositor: «Anima Christi» — Versículo: «Uno de los soldados le traspasó el costado con una lanza, y al instante salió sangre y agua» — Jn 19,34 — Tiempos: Comunión, Todo el Año Litúrgico\n• Aquí Estoy, Señor [Comunión] — Versículo: «Habla, Señor, que tu siervo escucha» — 1 Sam 3,10 — Tiempos: Comunión, Todo el Año Litúrgico\n• Camino Firme [Comunión] — Versículo: «Levántate y come, porque el camino es demasiado largo para ti» — 1 Re 19,7 — Tiempos: Comunión, Ordinario\n• Divino Manjar [Comunión] — Versículo: «Yo soy el pan vivo bajado del cielo. El que coma de este pan vivirá para siempre» — Jn 6,51 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Incomparable [Comunión] — Versículo: «Y conocer el amor de Cristo, que excede a todo conocimiento, para que os vayáis llenando hasta la total plenitud de Dios» — Ef 3,19 — Tiempos: Comunión, Ordinario\n• Me Has Seducido, Señor [Comunión] — Compositor: Jeremías 20,7 — Versículo: «Me has seducido, Señor, y me dejé seducir; me has agarrado y me has podido» — Jr 20,7 — Tiempos: Comunión, Ordinario\n• Milagro de Amor [Comunión] — Versículo: «Anunciad la muerte del Señor hasta que Él venga» — 1 Cor 11,26 — Tiempos: Comunión, Todo el Año Litúrgico\n• Oh Buen Jesús [Comunión] — Versículo: «Yo soy el buen pastor. El buen pastor da su vida por las ovejas» — Jn 10,11 — Tiempos: Comunión, Ordinario\n• Pan de Vida, Pan de Fe [Comunión] — Versículo: «Porque el pan de Dios es el que baja del cielo y da vida al mundo» — Jn 6,33 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Pescador de Hombres [Comunión] — Compositor: Cesáreo Gabaráin — Versículo: «Venid conmigo y os haré pescadores de hombres. Y al instante, dejando las redes, lo siguieron» — Mc 1,17-18 — Tiempos: Comunión, Misión, Ordinario\n• Salmo 63 – Dios Mío Eres Tú [Comunión] — Compositor: Salmo 63 (62) — Versículo: «Oh Dios, Tú eres mi Dios; mi alma tiene sed de Ti, mi carne Te anhela como tierra seca y árida» — Sal 63,2 — Tiempos: Comunión, Adoración eucarística, Todo el Año Litúrgico\n• Señor, a Quién Iremos [Comunión] — Versículo: «Señor, ¿a quién iremos? Tú tienes palabras de vida eterna, y nosotros hemos creído y sabemos que Tú eres el Santo de Dios» — Jn 6,68-69 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Symbolum 77 [Comunión] — Compositor: Pierangelo Sequeri — Versículo: «La fe es garantía de lo que se espera, prueba de lo que no se ve» — Heb 11,1 — Tiempos: Comunión, Ordinario\n• Te Hiciste Pan [Comunión] — Versículo: «El que come mi carne y bebe mi sangre permanece en mí y yo en él» — Jn 6,56 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Te Seguiré – M. Frisina [Comunión] — Compositor: Mons. Marco Frisina — Versículo: «Cuando Jesús dijo esto, añadió: Sígueme» — Jn 21,19 — Tiempos: Comunión, Ordinario\n• Verbum Panis [Comunión] — Compositor: Mite Balduzzi — Versículo: «En el principio existía el Verbo, y el Verbo estaba junto a Dios, y el Verbo era Dios» — Jn 1,1 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Ya No Eres Pan y Vino [Comunión] — Compositor: transubstanciación — Versículo: «Esto es mi Cuerpo, que se entrega por vosotros. Haced esto en memoria mía» — Lc 22,19 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Yo Soy el Camino Firme [Comunión] — Versículo: «Yo soy el camino, la verdad y la vida. Nadie va al Padre sino por mí» — Jn 14,6 — Tiempos: Comunión, Ordinario\n• Yo soy el Pan de Vida [Comunión] — Compositor: Juan 6,35 — Versículo: «Yo soy el pan de vida. El que viene a mí no tendrá hambre, y el que cree en mí no tendrá sed jamás» — Jn 6,35 — Tiempos: Comunión, Todo el Año Litúrgico, Corpus Christi\n• Ave María (Verbum Panis) [Salida] — Compositor: Mite Balduzzi — Versículo: «¡Bendita tú entre las mujeres, y bendito el fruto de tu vientre!» — Lc 1,42 — Tiempos: Salida, Fiestas marianas, Todo el Año Litúrgico\n• Ave María Blues [Salida] — Versículo: «Alégrate, llena de gracia, el Señor está contigo» — Lc 1,28 — Tiempos: Salida, Fiestas marianas, Ordinario\n• Dios te Salve María (Betsaida) [Salida] — Compositor: Betsaida — Versículo: «Desde ahora me llamarán bienaventurada todas las generaciones» — Lc 1,48 — Tiempos: Salida, Fiestas marianas, Todo el Año Litúrgico\n• Ella Es [Salida] — Versículo: «Junto a la cruz de Jesús estaban Su madre, la hermana de Su madre, María la de Cleofás, y María Magdalena» — Jn 19,25 — Tiempos: Salida, Fiestas marianas, Ordinario\n• Madre del Silencio [Salida] — Versículo: «María conservaba todas estas cosas, meditándolas en su corazón» — Lc 2,19 — Tiempos: Salida, Fiestas marianas, Adviento, Cuaresma\n• María Mírame [Salida] — Versículo: «La madre de Jesús le dijo: No tienen vino» — Jn 2,3 — Tiempos: Salida, Fiestas marianas, Ordinario\n• María, Tú [Salida] — Versículo: «Jesús dijo a Su madre: Mujer, ahí tienes a tu hijo. Luego dijo al discípulo: Ahí tienes a tu madre» — Jn 19,26-27 — Tiempos: Salida, Fiestas marianas, Ordinario\n• Rezo Por Ti [Salida] — Versículo: «Orad unos por otros para que seáis sanados. La oración ferviente del justo tiene mucho poder» — St 5,16 — Tiempos: Salida, Ordinario\n• Toda Hermosa [Salida] — Compositor: Hermana Inés de Jesús — Versículo: «Toda hermosa eres, amada mía, y no hay mancha en ti» — Ct 4,7 — Tiempos: Salida, Fiestas marianas, Inmaculada Concepción\n• Tus Maravillas [Salida] — Compositor: Mite Balduzzi — Versículo: «Mi alma glorifica al Señor, mi espíritu se alegra en Dios mi Salvador, porque ha mirado la humildad de Su esclava» — Lc 1,46-48 — Tiempos: Salida, Acción de Gracias, Todo el Año Litúrgico\n• Un Día del Cielo un Ángel [Salida] — Versículo: «El ángel le dijo: No temas, María, porque has hallado gracia delante de Dios. Concebirás y darás a luz un hijo, y le pondrás por nombre Jesús» — Lc 1,30-31 — Tiempos: Salida, Fiestas marianas, Adviento\n• Anima Christi – Marco Frisina [Exposición del Santísimo] — Compositor: Mons. Marco Frisina — Versículo: «Uno de los soldados le traspasó el costado con una lanza, y al instante salió sangre y agua» — Jn 19,34 — Tiempos: Exposición del Santísimo, Adoración eucarística, Todo el Año Litúrgico\n• Cantemos al Amor de los Amores [Exposición del Santísimo] — Versículo: «Nadie tiene amor más grande que el que da la vida por sus amigos» — Jn 15,13 — Tiempos: Exposición del Santísimo, Corpus Christi, Todo el Año Litúrgico\n• Canten con Gozo [✦ Momentos Especiales ✦] — Versículo: «Estad siempre alegres en el Señor; os lo repito: estad alegres» — Flp 4,4 — Tiempos: Momentos especiales, Todo el Año Litúrgico\n• Adorador [Adoración/Reflexión — Acción de Gracias] — Compositor: Daniel Poli — Versículo: «Llega la hora, y es ahora, en que los verdaderos adoradores adorarán al Padre en espíritu y en verdad, porque así quiere el Padre que sean los que lo adoren» — Jn 4,23 — Tiempos: Adoración, Ordinario\n• El Espíritu de Dios Está en Este Lugar [Adoración/Reflexión — Acción de Gracias] — Versículo: «De repente vino del cielo un ruido como el de un viento recio, que llenó toda la casa donde se encontraban» — Hch 2,2 — Tiempos: Adoración, Pascua, Pentecostés, Ordinario\n• Gloria (Valverde) [Adoración/Reflexión — Acción de Gracias] — Compositor: Martín Valverde — Versículo: «Dios lo exaltó y le dio el nombre que está sobre todo nombre, para que ante el nombre de Jesús toda rodilla se doble» — Flp 2,9-10 — Tiempos: Adoración, Pascua, Ordinario\n• Nada Te Turbe [Adoración/Reflexión — Acción de Gracias] — Compositor: Santa Teresa de Jesús — Versículo: «La paz os dejo, mi paz os doy. No os la doy como la da el mundo. No se turbe vuestro corazón ni se acobarde» — Jn 14,27 — Tiempos: Adoración, Todo el Año Litúrgico\n• Rey de Reyes [Adoración/Reflexión — Acción de Gracias] — Versículo: «En su manto y en su muslo lleva escrito un nombre: Rey de Reyes y Señor de Señores» — Ap 19,16 — Tiempos: Adoración, Cristo Rey, Pascua, Ordinario\n• Dame del Agua que Brota [Animación] — Versículo: «El que beba del agua que yo le daré no tendrá sed jamás, sino que el agua que yo le daré se convertirá en él en un manantial que brota para la vida eterna» — Jn 4,14 — Tiempos: Animación, Ordinario, Cuaresma\n• Granito de Mostaza [Animación] — Versículo: «El Reino de los cielos es semejante a un grano de mostaza que un hombre sembró en su campo. Es la más pequeña de las semillas, pero cuando crece es la mayor de las hortalizas» — Mt 13,31-32 — Tiempos: Animación, Ordinario\n• Jesús Está Pasando por Aquí [Animación] — Versículo: «Al enterarse de que pasaba Jesús de Nazaret, comenzó a gritar: ¡Jesús, Hijo de David, ten piedad de mí!» — Mc 10,47 — Tiempos: Animación, Ordinario\n• Mi Dios Está Vivo [Animación] — Versículo: «Porque vosotros os convertisteis a Dios, dejando los ídolos para servir al Dios vivo y verdadero» — 1 Tes 1,9 — Tiempos: Animación, Ordinario, Pascua\n• Mi Mano Está Llena [Animación] — Versículo: «Dad y se os dará; una medida buena, apretada, remecida y rebosante pondrán en vuestro regazo» — Lc 6,38 — Tiempos: Animación, Ordinario\n• Porque Cristo Ha Tomado Mi Vida [Animación] — Versículo: «Ya no soy yo quien vive, sino que es Cristo quien vive en mí. Y la vida que vivo ahora en la carne, la vivo en la fe del Hijo de Dios, que me amó y se entregó por mí» — Gal 2,20 — Tiempos: Animación, Ordinario, Pascua, Animación, Pascua\n• Que Viva Cristo [Animación] — Versículo: «Jesús es el Señor» — la profesión de fe más antigua del cristianismo (Rom 10,9; 1 Cor 12,3; Flp 2,11) — Tiempos: Animación, Pascua, Cristo Rey, Ordinario\n• Vamos a Alabar al Señor [Animación] — Versículo: «¡Alabad al Señor! Alabadlo en Su santuario, alabadlo en Su poderoso firmamento. ¡Todo lo que respira alabe al Señor!» — Sal 150,1.6 — Tiempos: Animación, Todo el Año Litúrgico\n• Santo – Alejandro Mejía [Santo] — Compositor: Alejandro Mejía — Versículo: «Santo, Santo, Santo es el Señor de los ejércitos; toda la tierra está llena de Su gloria» — Is 6,3 — Tiempos: Santo, Todo el Año Litúrgico\n• El Amor de mi Dios [Comunión] — Compositor: Hermana Inés de Jesús — Versículo: «Ni la muerte ni la vida, ni los ángeles ni los principados... podrá separarnos del amor de Dios manifestado en Cristo Jesús» — Rom 8,38-39 — Tiempos: Comunión, Todo el Año Litúrgico\n• Alma Misionera [Salida] — Compositor: Enrique García Vélez — Versículo: «Id por todo el mundo y proclamad el Evangelio a toda la creación» — Mc 16,15 — Tiempos: Salida, Animación, Misión, Ordinario`;

var AI_SYSTEM=`Eres el Asistente Litúrgico del Coro Pacem Deus, un coro de la Parroquia Sagrada Familia. RESPONDE SIEMPRE EN EL IDIOMA DEL USUARIO. Por defecto: español. NUNCA mezcles idiomas.

REGLAS:
- IDIOMA: Responde SIEMPRE en el idioma en que el usuario te escriba. Si te escriben en español, responde en español. Si en inglés, en inglés. NUNCA mezcles idiomas. Por defecto: español.
- Sé conciso pero preciso. No inventes información.
- Usa SOLO cantos del catálogo (nunca inventes cantos).
- USA GOOGLE SEARCH para buscar las lecturas exactas del domingo consultado (ej: 'lecturas misa domingo 12 abril 2026'). NUNCA adivines las lecturas de memoria.
- Usa pronombres en mayúscula para Dios/Jesús/María: Tú, Ti, Te, Él, Su.
- La fecha de hoy es: ${new Date().toLocaleDateString('es-PE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.

FORMATO DE RESPUESTA (obligatorio):
- NUNCA muestres los IDs internos del catálogo (d04|Entrada|...) en tu respuesta. Eso es formato interno, el usuario no debe verlo.
- Presenta los cantos así: **Nombre del Canto** (Compositor si se conoce).
- Usa negritas (**texto**) para nombres de cantos y secciones litúrgicas.
- Separa cada momento litúrgico con su nombre en negrita.
- No uses bloques de código ni formato técnico.

MÉTODO PARA RECOMENDAR SETLISTS:
1. Busca con Google Search las lecturas REALES del domingo.
2. Identifica los TEMAS CENTRALES: misericordia, fe, comunidad, resurrección, etc.
3. Para cada momento, busca cantos cuyo VERSÍCULO BÍBLICO conecte temáticamente con las lecturas — no te guíes solo por el título del canto.
4. Marca como CLAVE (★) los cantos cuya conexión bíblica sea directa. Explica POR QUÉ conecta con la lectura del día.
5. Ofrece 2 opciones cuando sea natural, sin forzar.
6. Para momentos sin conexión especial (ej: Santo siempre es el mismo texto), recomienda brevemente sin justificación extensa.

ESTRUCTURA DE LA MISA (momentos litúrgicos en orden):
1. Entrada - Canto procesional de ingreso
2. Piedad (Kyrie) - Acto penitencial
3. Gloria - Himno de alabanza (se omite en Adviento y Cuaresma)
4. Aleluya - Aclamación antes del Evangelio (se omite en Cuaresma)
5. Aclamación del Evangelio - Respuesta post-Evangelio
6. Ofertorio - Preparación de los dones
7. Santo (Sanctus) - IGMR §79, toda la asamblea
8. Cordero de Dios (Agnus Dei) - Fracción del pan
9. Comunión - Procesión eucarística
10. Salida - Despedida

CATÁLOGO DE 100 CANTOS DEL CORO PACEM DEUS:
${AI_CATALOG}

CALENDARIO LITÚRGICO (Ciclo A=2026, B=2027, C=2028):
- Adviento: 4 domingos antes de Navidad (NO se canta Gloria ni Aleluya)
- Navidad: 25 dic - Bautismo del Señor
- Ordinario I: después del Bautismo hasta Miércoles de Ceniza
- Cuaresma: Ceniza → Sábado Santo (NO se canta Gloria ni Aleluya; el Aleluya se reemplaza por aclamación cuaresmal)
- Pascua: Domingo de Resurrección → Pentecostés (50 días de MÁXIMA alegría; se retoma el Aleluya con júbilo)
- Ordinario II: después de Pentecostés hasta Adviento
- Solemnidades especiales: Santísima Trinidad, Corpus Christi, Cristo Rey, Inmaculada Concepción, fiestas marianas

Al recomendar un setlist, identifica los cantos CLAVE (los que conectan directamente con las lecturas) y explica por qué. El resto déjalo a criterio del director.`;

function toggleAIPanel(){
  var p=document.getElementById('ai-panel');
  p.classList.toggle('open');
}

function aiSuggest(t){
  document.getElementById('ai-input').value=t;
  aiSend();
}

function aiAddMsg(role,text){
  var m=document.getElementById('ai-messages');
  var w=m.querySelector('.ai-welcome');
  if(w)w.remove();
  var d=document.createElement('div');
  d.className='ai-msg ai-msg-'+role;
  d.innerHTML=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');
  m.appendChild(d);
  m.scrollTop=m.scrollHeight;
  return d;
}

function aiShowTyping(){
  var m=document.getElementById('ai-messages');
  var d=document.createElement('div');
  d.className='ai-typing';
  d.id='ai-typing';
  d.textContent='Pensando';
  m.appendChild(d);
  m.scrollTop=m.scrollHeight;
}
function aiHideTyping(){var t=document.getElementById('ai-typing');if(t)t.remove();}

async function aiSend(){
  var inp=document.getElementById('ai-input');
  var txt=inp.value.trim();
  if(!txt)return;
  inp.value='';
  inp.style.height='auto';
  document.getElementById('ai-send-btn').disabled=true;

  aiAddMsg('user',txt);
  _ai.h.push({role:'user',parts:[{text:txt}]});

  aiShowTyping();

  try{
    var r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+_gk(),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        system_instruction:{parts:[{text:AI_SYSTEM}]},
        contents:_ai.h,
        tools:[{google_search:{}}],
        generationConfig:{temperature:0.7,maxOutputTokens:8192}
      })
    });
    var d=await r.json();
    aiHideTyping();

    if(d.candidates&&d.candidates[0]&&d.candidates[0].content){
      var reply=d.candidates[0].content.parts[0].text;
      aiAddMsg('ai',reply);
      _ai.h.push({role:'model',parts:[{text:reply}]});
    }else{
      var err=d.error?d.error.message:'Respuesta vacía';
      aiAddMsg('ai','*Error: '+err+'*');
    }
  }catch(e){
    aiHideTyping();
    aiAddMsg('ai','*Error de conexión. Verifica tu internet.*');
  }
  document.getElementById('ai-send-btn').disabled=false;
  document.getElementById('ai-input').focus();
}
