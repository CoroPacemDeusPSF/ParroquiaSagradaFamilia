/* ────────────────────────────────────────────────────────────────────────────
 * Coro Pacem Deus — Parroquia Sagrada Familia
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   @file       js/modules/21-liturgical-card.js
 *   @brief      Lit-card: domingo actual, ciclo, evangelio, salmo (cálculo automático)
 *   @author     Renzo Núñez Berdejo
 *   @project    Cancionero Dominical
 *   @version    v3.2.34
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

/* ============================================================================
   21-liturgical-card.js
   ============================================================================
   Liturgical card — Evangelio del día (cálculo del calendario litúrgico)

   Calcula el próximo domingo, ciclo (A/B/C), Evangelio. Renderiza .lit-card.

   ORDEN DE CARGA: posición 21 de 24 (orden DOM original).
   El orden importa: este script puede depender de globals definidos por
   scripts anteriores y/o ser dependencia de scripts posteriores.
   ============================================================================ */

/* ── Liturgical card (3-year calendar) ── */
(function(){
  var D={
    '2025-11-30':{t:'Adviento',n:'I Domingo de Adviento',e:'',c:'Morado',ev:'Mt 24,37-44',tema:'Estad preparados',ant:'Vamos alegres a la casa del Señor',ci:'A'},
    '2025-12-07':{t:'Adviento',n:'II Domingo de Adviento',e:'',c:'Morado',ev:'Mt 3,1-12',tema:'Convertíos, porque el Reino está cerca',ant:'Que en sus días florezca la justicia y la paz abunde eternamente',ci:'A'},
    '2025-12-14':{t:'Adviento',n:'III Domingo de Adviento',e:'Gaudete',c:'Rosa',ev:'Mt 11,2-11',tema:'¿Eres Tú el que ha de venir?',ant:'Ven, Señor, a salvarnos',ci:'A'},
    '2025-12-21':{t:'Adviento',n:'IV Domingo de Adviento',e:'',c:'Morado',ev:'Mt 1,18-24',tema:'Le pondrás por nombre Jesús',ant:'Va a entrar el Señor; Él es el Rey de la gloria',ci:'A'},
    '2025-12-25':{t:'Navidad',n:'Natividad del Señor',e:'Solemnidad',c:'Blanco',ev:'Jn 1,1-18',tema:'El Verbo se hizo carne',ant:'Los confines de la tierra han contemplado la salvación de nuestro Dios',ci:'A'},
    '2025-12-28':{t:'Navidad',n:'Sagrada Familia',e:'',c:'Blanco',ev:'Mt 2,13-15.19-23',tema:'Levántate, toma al niño y a su madre',ant:'Dichosos los que temen al Señor y siguen sus caminos',ci:'A'},
    '2026-01-04':{t:'Navidad',n:'II Domingo de Navidad',e:'',c:'Blanco',ev:'Jn 1,1-18',tema:'El Verbo se hizo carne',ant:'El Verbo se hizo carne y habitó entre nosotros',ci:'A'},
    '2026-01-06':{t:'Navidad',n:'Epifanía del Señor',e:'Solemnidad',c:'Blanco',ev:'Mt 2,1-12',tema:'Hemos venido a adorarlo',ant:'Se postrarán ante Ti, Señor, todos los pueblos de la tierra',ci:'A'},
    '2026-01-11':{t:'Ordinario',n:'Bautismo del Señor',e:'',c:'Blanco',ev:'Mt 3,13-17',tema:'Este es mi Hijo amado',ant:'El Señor bendice a su pueblo con la paz',ci:'A'},
    '2026-01-18':{t:'Ordinario',n:'II Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 1,29-34',tema:'He ahí el Cordero de Dios',ant:'Aquí estoy, Señor, para hacer Tu voluntad',ci:'A'},
    '2026-01-25':{t:'Ordinario',n:'III Domingo del Tiempo Ordinario',e:'Domingo de la Palabra de Dios',c:'Verde',ev:'Mt 4,12-23',tema:'Venid conmigo',ant:'El Señor es mi luz y mi salvación',ci:'A'},
    '2026-02-01':{t:'Ordinario',n:'IV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 5,1-12a',tema:'Bienaventurados los pobres de espíritu',ant:'Bienaventurados los pobres en el espíritu, porque de ellos es el reino de los cielos',ci:'A'},
    '2026-02-08':{t:'Ordinario',n:'V Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 5,13-16',tema:'Vosotros sois la luz del mundo',ant:'El justo brilla en las tinieblas como una luz',ci:'A'},
    '2026-02-15':{t:'Ordinario',n:'VI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 5,17-37',tema:'Se dijo… pero yo os digo',ant:'Dichoso el que camina en la ley del Señor',ci:'A'},
    '2026-02-22':{t:'Cuaresma',n:'I Domingo de Cuaresma',e:'',c:'Morado',ev:'Mt 4,1-11',tema:'No solo de pan vive el hombre',ant:'Misericordia, Señor, hemos pecado',ci:'A'},
    '2026-03-01':{t:'Cuaresma',n:'II Domingo de Cuaresma',e:'',c:'Morado',ev:'Mt 17,1-9',tema:'Este es mi Hijo amado; escuchadlo',ant:'Que Tu misericordia, Señor, venga sobre nosotros, como lo esperamos de Ti',ci:'A'},
    '2026-03-08':{t:'Cuaresma',n:'III Domingo de Cuaresma',e:'',c:'Morado',ev:'Jn 4,5-42',tema:'Dame de beber',ant:'Ojalá escuchéis hoy la voz del Señor: «No endurezcáis vuestro corazón»',ci:'A'},
    '2026-03-15':{t:'Cuaresma',n:'IV Domingo de Cuaresma',e:'Laetare',c:'Rosa',ev:'Jn 9,1-41',tema:'Yo soy la luz del mundo',ant:'El Señor es mi pastor, nada me falta',ci:'A'},
    '2026-03-22':{t:'Cuaresma',n:'V Domingo de Cuaresma',e:'',c:'Morado',ev:'Jn 11,1-45',tema:'Yo soy la resurrección y la vida',ant:'Del Señor viene la misericordia, la redención copiosa',ci:'A'},
    '2026-03-29':{t:'Cuaresma',n:'Domingo de Ramos',e:'Pasión del Señor',c:'Rojo',ev:'Mt 26,14—27,66',tema:'Dios mío, ¿por qué me has abandonado?',ant:'Dios mío, Dios mío, ¿por qué me has abandonado?',ci:'A'},
    '2026-04-05':{t:'Pascua',n:'Domingo de Pascua',e:'Resurrección del Señor',c:'Blanco',ev:'Jn 20,1-9',tema:'Vio y creyó',ant:'Este es el día en que actuó el Señor: sea nuestra alegría y nuestro gozo',ci:'A'},
    '2026-04-12':{t:'Pascua',n:'II Domingo de Pascua',e:'Domingo de la Divina Misericordia',c:'Blanco',ev:'Jn 20,19-31',tema:'¡Señor mío y Dios mío!',ant:'Dad gracias al Señor porque es bueno, porque es eterna su misericordia',ci:'A'},
    '2026-04-19':{t:'Pascua',n:'III Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 21,1-19',tema:'Señor, Tú sabes que Te quiero',ant:'Señor, me enseñarás el sendero de la vida',ci:'A'},
    '2026-04-26':{t:'Pascua',n:'IV Domingo de Pascua',e:'Domingo del Buen Pastor',c:'Blanco',ev:'Jn 10,27-30',tema:'Mis ovejas escuchan mi voz',ant:'El Señor es mi pastor, nada me falta',ci:'A'},
    '2026-05-03':{t:'Pascua',n:'V Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 14,1-12',tema:'Yo soy el Camino, la Verdad y la Vida',ant:'Que Tu misericordia, Señor, venga sobre nosotros, como lo esperamos de Ti',ci:'A'},
    '2026-05-10':{t:'Pascua',n:'VI Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 14,15-21',tema:'No os dejaré huérfanos',ant:'Aclamad al Señor, tierra entera',ci:'A'},
    '2026-05-17':{t:'Pascua',n:'La Ascensión del Señor',e:'Solemnidad',c:'Blanco',ev:'Mt 28,16-20',tema:'Id y haced discípulos',ant:'Dios asciende entre aclamaciones; el Señor, al son de trompetas',ci:'A'},
    '2026-05-24':{t:'Pascua',n:'Domingo de Pentecostés',e:'Solemnidad',c:'Rojo',ev:'Jn 20,19-23',tema:'Recibid el Espíritu Santo',ant:'Envía Tu Espíritu, Señor, y repuebla la faz de la tierra',ci:'A'},
    '2026-05-31':{t:'Ordinario',n:'Santísima Trinidad',e:'Solemnidad',c:'Blanco',ev:'Jn 3,16-18',tema:'Tanto amó Dios al mundo',ant:'¡A Ti gloria y alabanza por los siglos!',ci:'A'},
    '2026-06-07':{t:'Ordinario',n:'Corpus Christi',e:'Solemnidad',c:'Blanco',ev:'Jn 6,51-58',tema:'Mi carne es verdadera comida y mi sangre verdadera bebida',ant:'Glorifica al Señor, Jerusalén',ci:'A'},
    '2026-06-14':{t:'Ordinario',n:'XI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 9,36—10,8',tema:'La mies es abundante',ant:'Nosotros somos su pueblo y ovejas de su rebaño',ci:'A'},
    '2026-06-21':{t:'Ordinario',n:'XII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 10,26-33',tema:'No tengáis miedo',ant:'Señor, que me escuche Tu gran bondad',ci:'A'},
    '2026-06-28':{t:'Ordinario',n:'XIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 10,37-42',tema:'El que no toma su cruz no es digno de mí',ant:'Cantaré eternamente las misericordias del Señor',ci:'A'},
    '2026-07-05':{t:'Ordinario',n:'XIV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 11,25-30',tema:'Venid a mí los que estáis cansados',ant:'Bendeciré Tu nombre por siempre, Dios mío, mi Rey',ci:'A'},
    '2026-07-12':{t:'Ordinario',n:'XV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 13,1-23',tema:'El sembrador salió a sembrar',ant:'La semilla cayó en tierra buena, y dio fruto',ci:'A'},
    '2026-07-19':{t:'Ordinario',n:'XVI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 13,24-43',tema:'Dejad crecer juntos trigo y cizaña',ant:'Tú, Señor, eres bueno y clemente',ci:'A'},
    '2026-07-26':{t:'Ordinario',n:'XVII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 13,44-52',tema:'Un tesoro escondido en el campo',ant:'¡Cuánto amo Tu ley, Señor!',ci:'A'},
    '2026-08-02':{t:'Ordinario',n:'XVIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 14,13-21',tema:'Dadles vosotros de comer',ant:'Abres Tú la mano, Señor, y nos sacias',ci:'A'},
    '2026-08-09':{t:'Ordinario',n:'XIX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 14,22-33',tema:'¡Ánimo, soy yo, no temáis!',ant:'Muéstranos, Señor, Tu misericordia y danos Tu salvación',ci:'A'},
    '2026-08-16':{t:'Ordinario',n:'XX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 15,21-28',tema:'Mujer, qué grande es tu fe',ant:'Oh, Dios, que te alaben los pueblos, que todos los pueblos te alaben',ci:'A'},
    '2026-08-23':{t:'Ordinario',n:'XXI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 16,13-20',tema:'Tú eres Pedro',ant:'Señor, Tu misericordia es eterna, no abandones la obra de Tus manos',ci:'A'},
    '2026-08-30':{t:'Ordinario',n:'XXII Domingo del Tiempo Ordinario',e:'Santa Rosa de Lima',c:'Verde',ev:'Mt 16,21-27',tema:'El que quiera venir conmigo, que cargue con su cruz',ant:'Mi alma está sedienta de Ti, Señor, Dios mío',ci:'A'},
    '2026-09-06':{t:'Ordinario',n:'XXIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 18,15-20',tema:'Donde dos o tres están reunidos en mi nombre',ant:'Ojalá escuchéis hoy la voz del Señor: «No endurezcáis vuestro corazón»',ci:'A'},
    '2026-09-13':{t:'Ordinario',n:'XXIV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 18,21-35',tema:'Perdona setenta veces siete',ant:'El Señor es compasivo y misericordioso, lento a la ira y rico en clemencia',ci:'A'},
    '2026-09-20':{t:'Ordinario',n:'XXV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 20,1-16',tema:'¿Vas a tener envidia porque yo soy bueno?',ant:'Cerca está el Señor de los que lo invocan',ci:'A'},
    '2026-09-27':{t:'Ordinario',n:'XXVI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 21,28-32',tema:'Los publicanos y las prostitutas os preceden',ant:'Recuerda, Señor, Tu ternura',ci:'A'},
    '2026-10-04':{t:'Ordinario',n:'XXVII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 21,33-43',tema:'La piedra que desecharon los constructores',ant:'La viña del Señor es la casa de Israel',ci:'A'},
    '2026-10-11':{t:'Ordinario',n:'XXVIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 22,1-14',tema:'Muchos son los llamados, pocos los elegidos',ant:'Habitaré en la casa del Señor por años sin término',ci:'A'},
    '2026-10-18':{t:'Ordinario',n:'XXIX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 22,15-21',tema:'Dad al César lo que es del César',ant:'Aclamad la gloria y el poder del Señor',ci:'A'},
    '2026-10-25':{t:'Ordinario',n:'XXX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 22,34-40',tema:'Amarás al Señor tu Dios con todo tu corazón',ant:'Yo te amo, Señor; Tú eres mi fortaleza',ci:'A'},
    '2026-11-01':{t:'Ordinario',n:'Todos los Santos',e:'Solemnidad',c:'Blanco',ev:'Mt 5,1-12a',tema:'Bienaventurados',ant:'Esta es la generación que busca Tu rostro, Señor',ci:'A'},
    '2026-11-08':{t:'Ordinario',n:'XXXII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 25,1-13',tema:'Llegó el esposo; salid a recibirlo',ant:'Mi alma está sedienta de Ti, Señor, Dios mío',ci:'A'},
    '2026-11-15':{t:'Ordinario',n:'XXXIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mt 25,14-30',tema:'Bien, siervo bueno y fiel',ant:'Dichosos los que temen al Señor',ci:'A'},
    '2026-11-22':{t:'Ordinario',n:'Cristo Rey del Universo',e:'Solemnidad',c:'Blanco',ev:'Mt 25,31-46',tema:'Lo que hicisteis con uno de estos pequeños, conmigo lo hicisteis',ant:'El Señor es mi pastor, nada me falta',ci:'A'},
    '2026-11-29':{t:'Adviento',n:'I Domingo de Adviento',e:'',c:'Morado',ev:'Mc 13,33-37',tema:'Velad, porque no sabéis cuándo llegará el dueño',ant:'Oh, Dios, restáuranos, que brille Tu rostro y nos salve',ci:'B'},
    '2026-12-06':{t:'Adviento',n:'II Domingo de Adviento',e:'',c:'Morado',ev:'Mc 1,1-8',tema:'Preparad el camino del Señor',ant:'Muéstranos, Señor, Tu misericordia y danos Tu salvación',ci:'B'},
    '2026-12-13':{t:'Adviento',n:'III Domingo de Adviento',e:'Gaudete',c:'Rosa',ev:'Jn 1,6-8.19-28',tema:'En medio de vosotros hay uno que no conocéis',ant:'Me alegro con mi Dios',ci:'B'},
    '2026-12-20':{t:'Adviento',n:'IV Domingo de Adviento',e:'',c:'Morado',ev:'Lc 1,26-38',tema:'Alégrate, llena de gracia',ant:'Cantaré eternamente Tus misericordias, Señor',ci:'B'},
    '2026-12-25':{t:'Navidad',n:'Natividad del Señor',e:'Solemnidad',c:'Blanco',ev:'Jn 1,1-18',tema:'El Verbo se hizo carne',ant:'Los confines de la tierra han contemplado la salvación de nuestro Dios',ci:'B'},
    '2026-12-27':{t:'Navidad',n:'Sagrada Familia',e:'',c:'Blanco',ev:'Lc 2,22-40',tema:'El niño crecía lleno de sabiduría',ant:'Dichosos los que temen al Señor y siguen sus caminos',ci:'B'},
    '2027-01-03':{t:'Navidad',n:'II Domingo de Navidad',e:'',c:'Blanco',ev:'Jn 1,1-18',tema:'El Verbo se hizo carne',ant:'El Verbo se hizo carne y habitó entre nosotros',ci:'B'},
    '2027-01-10':{t:'Navidad',n:'Bautismo del Señor',e:'',c:'Blanco',ev:'Mc 1,7-11',tema:'Tú eres mi Hijo amado',ant:'El Señor bendice a su pueblo con la paz',ci:'B'},
    '2027-01-17':{t:'Ordinario',n:'II Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 1,35-42',tema:'Hemos encontrado al Mesías',ant:'Aquí estoy, Señor, para hacer Tu voluntad',ci:'B'},
    '2027-01-24':{t:'Ordinario',n:'III Domingo del Tiempo Ordinario',e:'Domingo de la Palabra de Dios',c:'Verde',ev:'Mc 1,14-20',tema:'Venid conmigo y os haré pescadores de hombres',ant:'Señor, enséñame Tus caminos',ci:'B'},
    '2027-01-31':{t:'Ordinario',n:'IV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 1,21-28',tema:'Enseñaba con autoridad',ant:'Ojalá escuchéis hoy la voz del Señor: «No endurezcáis vuestro corazón»',ci:'B'},
    '2027-02-07':{t:'Ordinario',n:'V Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 1,29-39',tema:'Curó a muchos enfermos',ant:'Alabad al Señor, que sana los corazones destrozados',ci:'B'},
    '2027-02-14':{t:'Cuaresma',n:'I Domingo de Cuaresma',e:'',c:'Morado',ev:'Mc 1,12-15',tema:'Convertíos y creed en el Evangelio',ant:'Tus sendas, Señor, son misericordia y lealtad para los que guardan Tu alianza',ci:'B'},
    '2027-02-21':{t:'Cuaresma',n:'II Domingo de Cuaresma',e:'',c:'Morado',ev:'Mc 9,2-10',tema:'Este es mi Hijo amado',ant:'Caminaré en presencia del Señor en el país de los vivos',ci:'B'},
    '2027-02-28':{t:'Cuaresma',n:'III Domingo de Cuaresma',e:'',c:'Morado',ev:'Jn 2,13-25',tema:'Destruid este templo y en tres días lo levantaré',ant:'Señor, Tú tienes palabras de vida eterna',ci:'B'},
    '2027-03-07':{t:'Cuaresma',n:'IV Domingo de Cuaresma',e:'Laetare',c:'Rosa',ev:'Jn 3,14-21',tema:'Tanto amó Dios al mundo',ant:'Que se me pegue la lengua al paladar si no me acuerdo de Ti',ci:'B'},
    '2027-03-14':{t:'Cuaresma',n:'V Domingo de Cuaresma',e:'',c:'Morado',ev:'Jn 12,20-33',tema:'Si el grano de trigo cae en tierra y muere, da mucho fruto',ant:'Oh, Dios, crea en mí un corazón puro',ci:'B'},
    '2027-03-21':{t:'Cuaresma',n:'Domingo de Ramos',e:'Pasión del Señor',c:'Rojo',ev:'Mc 14,1—15,47',tema:'Verdaderamente este hombre era Hijo de Dios',ant:'Dios mío, Dios mío, ¿por qué me has abandonado?',ci:'B'},
    '2027-03-28':{t:'Pascua',n:'Domingo de Pascua',e:'Resurrección del Señor',c:'Blanco',ev:'Jn 20,1-9',tema:'Vio y creyó',ant:'Este es el día en que actuó el Señor: sea nuestra alegría y nuestro gozo',ci:'B'},
    '2027-04-04':{t:'Pascua',n:'II Domingo de Pascua',e:'Domingo de la Divina Misericordia',c:'Blanco',ev:'Jn 20,19-31',tema:'¡Señor mío y Dios mío!',ant:'Dad gracias al Señor porque es bueno, porque es eterna su misericordia',ci:'B'},
    '2027-04-11':{t:'Pascua',n:'III Domingo de Pascua',e:'',c:'Blanco',ev:'Lc 24,35-48',tema:'Así estaba escrito: el Mesías padecerá',ant:'Haz brillar sobre nosotros, Señor, la luz de Tu rostro',ci:'B'},
    '2027-04-18':{t:'Pascua',n:'IV Domingo de Pascua',e:'Domingo del Buen Pastor',c:'Blanco',ev:'Jn 10,11-18',tema:'Yo soy el buen pastor',ant:'La piedra que desecharon los arquitectos es ahora la piedra angular',ci:'B'},
    '2027-04-25':{t:'Pascua',n:'V Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 15,1-8',tema:'Yo soy la vid, vosotros los sarmientos',ant:'El Señor es mi alabanza en la gran asamblea',ci:'B'},
    '2027-05-02':{t:'Pascua',n:'VI Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 15,9-17',tema:'Amaos unos a otros como yo os he amado',ant:'El Señor revela a las naciones su salvación',ci:'B'},
    '2027-05-09':{t:'Pascua',n:'La Ascensión del Señor',e:'Solemnidad',c:'Blanco',ev:'Mc 16,15-20',tema:'Id al mundo entero y proclamad el Evangelio',ant:'Dios asciende entre aclamaciones; el Señor, al son de trompetas',ci:'B'},
    '2027-05-16':{t:'Pascua',n:'Domingo de Pentecostés',e:'Solemnidad',c:'Rojo',ev:'Jn 15,26-27;16,12-15',tema:'El Espíritu de la verdad os guiará',ant:'Envía Tu Espíritu, Señor, y repuebla la faz de la tierra',ci:'B'},
    '2027-05-23':{t:'Ordinario',n:'Santísima Trinidad',e:'Solemnidad',c:'Blanco',ev:'Mt 28,16-20',tema:'Bautizadlos en el nombre del Padre, del Hijo y del Espíritu Santo',ant:'Dichoso el pueblo que el Señor se escogió como heredad',ci:'B'},
    '2027-05-30':{t:'Ordinario',n:'Corpus Christi',e:'Solemnidad',c:'Blanco',ev:'Mc 14,12-16.22-26',tema:'Esto es mi Cuerpo; esta es mi Sangre',ant:'Alzaré la copa de la salvación, invocando el nombre del Señor',ci:'B'},
    '2027-06-06':{t:'Ordinario',n:'X Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 3,20-35',tema:'El que haga la voluntad de Dios es mi hermano',ant:'Del Señor viene la misericordia, la redención copiosa',ci:'B'},
    '2027-06-13':{t:'Ordinario',n:'XI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 4,26-34',tema:'La semilla brota y crece sin que él sepa cómo',ant:'Es bueno darte gracias, Señor',ci:'B'},
    '2027-06-20':{t:'Ordinario',n:'XII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 4,35-41',tema:'¿Aún no tenéis fe?',ant:'¡Dad gracias al Señor, porque es eterna su misericordia!',ci:'B'},
    '2027-06-27':{t:'Ordinario',n:'XIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 5,21-43',tema:'Niña, a ti te digo, levántate',ant:'Te ensalzaré, Señor, porque me has librado',ci:'B'},
    '2027-07-04':{t:'Ordinario',n:'XIV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 6,1-6',tema:'No desprecian a un profeta más que en su tierra',ant:'Nuestros ojos están en el Señor, esperando su misericordia',ci:'B'},
    '2027-07-11':{t:'Ordinario',n:'XV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 6,7-13',tema:'Los envió de dos en dos',ant:'Muéstranos, Señor, Tu misericordia y danos Tu salvación',ci:'B'},
    '2027-07-18':{t:'Ordinario',n:'XVI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 6,30-34',tema:'Eran como ovejas sin pastor',ant:'El Señor es mi pastor, nada me falta',ci:'B'},
    '2027-07-25':{t:'Ordinario',n:'XVII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 6,1-15',tema:'Repartió a los que estaban sentados todo lo que quisieron',ant:'Abres Tú la mano, Señor, y nos sacias',ci:'B'},
    '2027-08-01':{t:'Ordinario',n:'XVIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 6,24-35',tema:'Yo soy el pan de vida',ant:'El Señor les dio pan del cielo',ci:'B'},
    '2027-08-08':{t:'Ordinario',n:'XIX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 6,41-51',tema:'Yo soy el pan vivo bajado del cielo',ant:'Gustad y ved qué bueno es el Señor',ci:'B'},
    '2027-08-15':{t:'Ordinario',n:'Asunción de la Virgen María',e:'Solemnidad',c:'Blanco',ev:'Lc 1,39-56',tema:'El Poderoso ha hecho obras grandes por mí',ant:'De pie a Tu derecha está la reina, enjoyada con oro de Ofir',ci:'B'},
    '2027-08-22':{t:'Ordinario',n:'XXI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 6,60-69',tema:'Señor, ¿a quién iremos? Tú tienes palabras de vida eterna',ant:'Gustad y ved qué bueno es el Señor',ci:'B'},
    '2027-08-29':{t:'Ordinario',n:'XXII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 7,1-8.14-15.21-23',tema:'Dejáis el mandamiento de Dios para aferraros a la tradición',ant:'Señor, ¿quién puede hospedarse en Tu tienda?',ci:'B'},
    '2027-09-05':{t:'Ordinario',n:'XXIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 7,31-37',tema:'Hace oír a los sordos y hablar a los mudos',ant:'Alaba, alma mía, al Señor',ci:'B'},
    '2027-09-12':{t:'Ordinario',n:'XXIV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 8,27-35',tema:'¿Quién decís que soy yo? — Tú eres el Cristo',ant:'Caminaré en presencia del Señor en el país de los vivos',ci:'B'},
    '2027-09-19':{t:'Ordinario',n:'XXV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 9,30-37',tema:'El que quiera ser primero, que sea el último',ant:'El Señor sostiene mi vida',ci:'B'},
    '2027-09-26':{t:'Ordinario',n:'XXVI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 9,38-43.45.47-48',tema:'El que no está contra nosotros está a favor',ant:'Los mandatos del Señor son rectos y alegran el corazón',ci:'B'},
    '2027-10-03':{t:'Ordinario',n:'XXVII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 10,2-16',tema:'Lo que Dios ha unido que no lo separe el hombre',ant:'Que el Señor nos bendiga todos los días de nuestra vida',ci:'B'},
    '2027-10-10':{t:'Ordinario',n:'XXVIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 10,17-30',tema:'Vende lo que tienes y sígueme',ant:'Sácianos de Tu misericordia, Señor, y estaremos alegres',ci:'B'},
    '2027-10-17':{t:'Ordinario',n:'XXIX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 10,35-45',tema:'El Hijo del hombre no vino a ser servido sino a servir',ant:'Que Tu misericordia, Señor, venga sobre nosotros, como lo esperamos de Ti',ci:'B'},
    '2027-10-24':{t:'Ordinario',n:'XXX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 10,46-52',tema:'Maestro, que pueda ver',ant:'El Señor ha estado grande con nosotros, y estamos alegres',ci:'B'},
    '2027-10-31':{t:'Ordinario',n:'XXXI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 12,28-34',tema:'Amarás al Señor tu Dios con todo tu corazón',ant:'Yo te amo, Señor; Tú eres mi fortaleza',ci:'B'},
    '2027-11-01':{t:'Ordinario',n:'Todos los Santos',e:'Solemnidad',c:'Blanco',ev:'Mt 5,1-12a',tema:'Bienaventurados',ant:'Esta es la generación que busca Tu rostro, Señor',ci:'B'},
    '2027-11-07':{t:'Ordinario',n:'XXXII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 12,38-44',tema:'Esta viuda pobre ha echado más que todos',ant:'Alaba, alma mía, al Señor',ci:'B'},
    '2027-11-14':{t:'Ordinario',n:'XXXIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Mc 13,24-32',tema:'El cielo y la tierra pasarán, pero mis palabras no pasarán',ant:'Protégeme, Dios mío, que me refugio en Ti',ci:'B'},
    '2027-11-21':{t:'Ordinario',n:'Cristo Rey del Universo',e:'Solemnidad',c:'Blanco',ev:'Jn 18,33-37',tema:'Mi Reino no es de este mundo',ant:'El Señor reina, vestido de majestad',ci:'B'},
    '2027-11-28':{t:'Adviento',n:'I Domingo de Adviento',e:'',c:'Morado',ev:'Lc 21,25-28.34-36',tema:'Levantaos, alzad la cabeza; se acerca vuestra liberación',ant:'A Ti, Señor, levanto mi alma',ci:'C'},
    '2027-12-05':{t:'Adviento',n:'II Domingo de Adviento',e:'',c:'Morado',ev:'Lc 3,1-6',tema:'Todos verán la salvación de Dios',ant:'El Señor ha estado grande con nosotros, y estamos alegres',ci:'C'},
    '2027-12-12':{t:'Adviento',n:'III Domingo de Adviento',e:'Gaudete',c:'Rosa',ev:'Lc 3,10-18',tema:'¿Qué debemos hacer?',ant:'Gritad jubilosos, porque es grande en medio de ti el Santo de Israel',ci:'C'},
    '2027-12-19':{t:'Adviento',n:'IV Domingo de Adviento',e:'',c:'Morado',ev:'Lc 1,39-45',tema:'Bendita tú entre las mujeres',ant:'Oh, Dios, restáuranos, que brille Tu rostro y nos salve',ci:'C'},
    '2027-12-25':{t:'Navidad',n:'Natividad del Señor',e:'Solemnidad',c:'Blanco',ev:'Jn 1,1-18',tema:'El Verbo se hizo carne',ant:'Los confines de la tierra han contemplado la salvación de nuestro Dios',ci:'C'},
    '2027-12-26':{t:'Navidad',n:'Sagrada Familia',e:'Fiesta',c:'Blanco',ev:'Lc 2,41-52',tema:'Sus padres lo encontraron en el templo, sentado en medio de los maestros',ant:'Dichosos los que temen al Señor y siguen sus caminos',ci:'C'},
    '2028-01-01':{t:'Navidad',n:'Santa María Madre de Dios',e:'Solemnidad',c:'Blanco',ev:'Lc 2,16-21',tema:'Le pusieron por nombre Jesús',ant:'Que Dios tenga piedad y nos bendiga',ci:'C'},
    '2028-01-02':{t:'Navidad',n:'Epifanía del Señor',e:'Solemnidad',c:'Blanco',ev:'Mt 2,1-12',tema:'Hemos venido a adorarlo',ant:'Se postrarán ante Ti, Señor, todos los pueblos de la tierra',ci:'C'},
    '2028-01-09':{t:'Navidad',n:'Bautismo del Señor',e:'',c:'Blanco',ev:'Lc 3,15-16.21-22',tema:'Tú eres mi Hijo amado',ant:'El Señor bendice a su pueblo con la paz',ci:'C'},
    '2028-01-16':{t:'Ordinario',n:'II Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Jn 2,1-12',tema:'La madre de Jesús le dijo: No tienen vino',ant:'Contad las maravillas del Señor a todas las naciones',ci:'C'},
    '2028-01-23':{t:'Ordinario',n:'III Domingo del Tiempo Ordinario',e:'Domingo de la Palabra de Dios',c:'Verde',ev:'Lc 1,1-4;4,14-21',tema:'Hoy se ha cumplido esta Escritura',ant:'Tus palabras, Señor, son espíritu y vida',ci:'C'},
    '2028-01-30':{t:'Ordinario',n:'IV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 4,21-30',tema:'Ningún profeta es aceptado en su tierra',ant:'Mi boca contará Tu salvación, Señor',ci:'C'},
    '2028-02-06':{t:'Ordinario',n:'V Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 5,1-11',tema:'Rema mar adentro y echad vuestras redes',ant:'Delante de los ángeles tañeré para Ti, Señor',ci:'C'},
    '2028-02-13':{t:'Ordinario',n:'VI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 6,17.20-26',tema:'Bienaventurados los pobres',ant:'Dichoso el hombre que ha puesto su confianza en el Señor',ci:'C'},
    '2028-02-20':{t:'Ordinario',n:'VII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 6,27-38',tema:'Amad a vuestros enemigos',ant:'El Señor es compasivo y misericordioso',ci:'C'},
    '2028-02-27':{t:'Ordinario',n:'VIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 6,39-45',tema:'De la abundancia del corazón habla la boca',ant:'Es bueno darte gracias, Señor',ci:'C'},
    '2028-03-05':{t:'Cuaresma',n:'I Domingo de Cuaresma',e:'',c:'Morado',ev:'Lc 4,1-13',tema:'No solo de pan vive el hombre',ant:'Quédate conmigo, Señor, en la tribulación',ci:'C'},
    '2028-03-12':{t:'Cuaresma',n:'II Domingo de Cuaresma',e:'',c:'Morado',ev:'Lc 9,28-36',tema:'Este es mi Hijo, el elegido; escuchadlo',ant:'El Señor es mi luz y mi salvación',ci:'C'},
    '2028-03-19':{t:'Cuaresma',n:'III Domingo de Cuaresma',e:'',c:'Morado',ev:'Lc 13,1-9',tema:'Si no os convertís, todos pereceréis',ant:'El Señor es compasivo y misericordioso',ci:'C'},
    '2028-03-26':{t:'Cuaresma',n:'IV Domingo de Cuaresma',e:'Laetare',c:'Rosa',ev:'Lc 15,1-3.11-32',tema:'Este hijo mío estaba muerto y ha revivido',ant:'Gustad y ved qué bueno es el Señor',ci:'C'},
    '2028-04-02':{t:'Cuaresma',n:'V Domingo de Cuaresma',e:'',c:'Morado',ev:'Jn 8,1-11',tema:'El que esté sin pecado que tire la primera piedra',ant:'El Señor ha estado grande con nosotros, y estamos alegres',ci:'C'},
    '2028-04-09':{t:'Cuaresma',n:'Domingo de Ramos',e:'Pasión del Señor',c:'Rojo',ev:'Lc 22,14—23,56',tema:'Padre, en Tus manos encomiendo mi espíritu',ant:'Dios mío, Dios mío, ¿por qué me has abandonado?',ci:'C'},
    '2028-04-16':{t:'Pascua',n:'Domingo de Pascua',e:'Resurrección del Señor',c:'Blanco',ev:'Jn 20,1-9',tema:'Vio y creyó',ant:'Este es el día en que actuó el Señor: sea nuestra alegría y nuestro gozo',ci:'C'},
    '2028-04-23':{t:'Pascua',n:'II Domingo de Pascua',e:'Domingo de la Divina Misericordia',c:'Blanco',ev:'Jn 20,19-31',tema:'¡Señor mío y Dios mío!',ant:'Dad gracias al Señor porque es bueno, porque es eterna su misericordia',ci:'C'},
    '2028-04-30':{t:'Pascua',n:'III Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 21,1-19',tema:'Señor, Tú lo sabes todo; Tú sabes que Te quiero',ant:'Te ensalzaré, Señor, porque me has librado',ci:'C'},
    '2028-05-07':{t:'Pascua',n:'IV Domingo de Pascua',e:'Domingo del Buen Pastor',c:'Blanco',ev:'Jn 10,27-30',tema:'Mis ovejas escuchan mi voz',ant:'Nosotros somos su pueblo y ovejas de su rebaño',ci:'C'},
    '2028-05-14':{t:'Pascua',n:'V Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 13,31-33a.34-35',tema:'Os doy un mandamiento nuevo: que os améis',ant:'Bendeciré Tu nombre por siempre, Dios mío, mi Rey',ci:'C'},
    '2028-05-21':{t:'Pascua',n:'VI Domingo de Pascua',e:'',c:'Blanco',ev:'Jn 14,23-29',tema:'El Espíritu Santo os enseñará todo',ant:'Oh, Dios, que te alaben los pueblos, que todos los pueblos te alaben',ci:'C'},
    '2028-05-28':{t:'Pascua',n:'La Ascensión del Señor',e:'Solemnidad',c:'Blanco',ev:'Lc 24,46-53',tema:'Seréis mis testigos',ant:'Dios asciende entre aclamaciones; el Señor, al son de trompetas',ci:'C'},
    '2028-06-04':{t:'Pascua',n:'Domingo de Pentecostés',e:'Solemnidad',c:'Rojo',ev:'Jn 20,19-23',tema:'Recibid el Espíritu Santo',ant:'Envía Tu Espíritu, Señor, y repuebla la faz de la tierra',ci:'C'},
    '2028-06-11':{t:'Ordinario',n:'Santísima Trinidad',e:'Solemnidad',c:'Blanco',ev:'Jn 16,12-15',tema:'Todo lo que tiene el Padre es mío',ant:'¡Señor, Dios nuestro, qué admirable es Tu nombre en toda la tierra!',ci:'C'},
    '2028-06-18':{t:'Ordinario',n:'Corpus Christi',e:'Solemnidad',c:'Blanco',ev:'Lc 9,11b-17',tema:'Dadles vosotros de comer',ant:'Tú eres sacerdote eterno, según el rito de Melquisedec',ci:'C'},
    '2028-06-25':{t:'Ordinario',n:'XIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 9,51-62',tema:'Te seguiré adondequiera que vayas',ant:'Tú eres, Señor, el lote de mi heredad',ci:'C'},
    '2028-07-02':{t:'Ordinario',n:'XIV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 10,1-12.17-20',tema:'La mies es abundante',ant:'Aclamad al Señor, tierra entera',ci:'C'},
    '2028-07-09':{t:'Ordinario',n:'XV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 10,25-37',tema:'¿Quién es mi prójimo?',ant:'Los mandatos del Señor son rectos y alegran el corazón',ci:'C'},
    '2028-07-16':{t:'Ordinario',n:'XVI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 10,38-42',tema:'María ha elegido la mejor parte',ant:'Señor, ¿quién puede hospedarse en Tu tienda?',ci:'C'},
    '2028-07-23':{t:'Ordinario',n:'XVII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 11,1-13',tema:'Señor, enséñanos a orar',ant:'Cuando te invoqué, me escuchaste, Señor',ci:'C'},
    '2028-07-30':{t:'Ordinario',n:'XVIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 12,13-21',tema:'La vida no depende de los bienes',ant:'Señor, Tú has sido nuestro refugio de generación en generación',ci:'C'},
    '2028-08-06':{t:'Ordinario',n:'Transfiguración del Señor',e:'Fiesta',c:'Blanco',ev:'Lc 9,28-36',tema:'Este es mi Hijo, el elegido',ant:'El Señor reina, Altísimo sobre toda la tierra',ci:'C'},
    '2028-08-13':{t:'Ordinario',n:'XIX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 12,32-48',tema:'Estad preparados',ant:'Dichoso el pueblo que el Señor se escogió como heredad',ci:'C'},
    '2028-08-15':{t:'Ordinario',n:'Asunción de la Virgen María',e:'Solemnidad',c:'Blanco',ev:'Lc 1,39-56',tema:'El Poderoso ha hecho obras grandes por mí',ant:'De pie a Tu derecha está la reina, enjoyada con oro de Ofir',ci:'C'},
    '2028-08-20':{t:'Ordinario',n:'XX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 12,49-53',tema:'He venido a traer fuego a la tierra',ant:'Señor, date prisa en socorrerme',ci:'C'},
    '2028-08-27':{t:'Ordinario',n:'XXI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 13,22-30',tema:'Vendrán de oriente y occidente',ant:'Id al mundo entero y proclamad el Evangelio',ci:'C'},
    '2028-09-03':{t:'Ordinario',n:'XXII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 14,1.7-14',tema:'El que se humilla será enaltecido',ant:'Tu bondad, oh, Dios, preparó una casa para los pobres',ci:'C'},
    '2028-09-10':{t:'Ordinario',n:'XXIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 14,25-33',tema:'El que no renuncia a todo no puede ser mi discípulo',ant:'Señor, Tú has sido nuestro refugio de generación en generación',ci:'C'},
    '2028-09-17':{t:'Ordinario',n:'XXIV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 15,1-32',tema:'Habrá más alegría en el cielo por un pecador que se convierta',ant:'Me levantaré, me pondré en camino adonde está mi Padre',ci:'C'},
    '2028-09-24':{t:'Ordinario',n:'XXV Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 16,1-13',tema:'No podéis servir a Dios y al dinero',ant:'Alabad al Señor, que alza al pobre',ci:'C'},
    '2028-10-01':{t:'Ordinario',n:'XXVI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 16,19-31',tema:'Recibiste bienes y Lázaro males',ant:'Alaba, alma mía, al Señor',ci:'C'},
    '2028-10-08':{t:'Ordinario',n:'XXVII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 17,5-10',tema:'Auméntanos la fe',ant:'Ojalá escuchéis hoy la voz del Señor: «No endurezcáis vuestro corazón»',ci:'C'},
    '2028-10-15':{t:'Ordinario',n:'XXVIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 17,11-19',tema:'¿No ha habido quien volviera a dar gloria a Dios?',ant:'El Señor revela a las naciones su salvación',ci:'C'},
    '2028-10-22':{t:'Ordinario',n:'XXIX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 18,1-8',tema:'Dios hará justicia a sus elegidos',ant:'Nuestro auxilio es el nombre del Señor, que hizo el cielo y la tierra',ci:'C'},
    '2028-10-29':{t:'Ordinario',n:'XXX Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 18,9-14',tema:'Oh Dios, ten compasión de este pecador',ant:'El afligido invocó al Señor, y Él lo escuchó',ci:'C'},
    '2028-11-01':{t:'Ordinario',n:'Todos los Santos',e:'Solemnidad',c:'Blanco',ev:'Mt 5,1-12a',tema:'Bienaventurados',ant:'Esta es la generación que busca Tu rostro, Señor',ci:'C'},
    '2028-11-05':{t:'Ordinario',n:'XXXI Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 19,1-10',tema:'El Hijo del hombre vino a buscar y salvar lo que estaba perdido',ant:'Bendeciré Tu nombre por siempre, Dios mío, mi Rey',ci:'C'},
    '2028-11-12':{t:'Ordinario',n:'XXXII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 20,27-38',tema:'No es Dios de muertos sino de vivos',ant:'Al despertar me saciaré de Tu semblante, Señor',ci:'C'},
    '2028-11-19':{t:'Ordinario',n:'XXXIII Domingo del Tiempo Ordinario',e:'',c:'Verde',ev:'Lc 21,5-19',tema:'Con vuestra perseverancia salvaréis vuestras almas',ant:'El Señor llega para regir los pueblos con rectitud',ci:'C'},
    '2028-11-26':{t:'Ordinario',n:'Cristo Rey del Universo',e:'Solemnidad',c:'Blanco',ev:'Lc 23,35-43',tema:'Hoy estarás conmigo en el paraíso',ant:'Vamos alegres a la casa del Señor',ci:'C'},
    '2028-12-03':{t:'Adviento',n:'I Domingo de Adviento',e:'',c:'Morado',ev:'Mt 24,37-44',tema:'Estad preparados',ant:'Vamos alegres a la casa del Señor',ci:'A'},
    '2028-12-10':{t:'Adviento',n:'II Domingo de Adviento',e:'',c:'Morado',ev:'Mt 3,1-12',tema:'Convertíos, porque el Reino está cerca',ant:'Que en sus días florezca la justicia y la paz abunde eternamente',ci:'A'},
    '2028-12-17':{t:'Adviento',n:'III Domingo de Adviento',e:'Gaudete',c:'Rosa',ev:'Mt 11,2-11',tema:'¿Eres Tú el que ha de venir?',ant:'Ven, Señor, a salvarnos',ci:'A'},
    '2028-12-24':{t:'Adviento',n:'IV Domingo de Adviento',e:'',c:'Morado',ev:'Mt 1,18-24',tema:'Le pondrás por nombre Jesús',ant:'Va a entrar el Señor; Él es el Rey de la gloria',ci:'A'},
    '2028-12-25':{t:'Navidad',n:'Natividad del Señor',e:'Solemnidad',c:'Blanco',ev:'Jn 1,1-18',tema:'El Verbo se hizo carne',ant:'Los confines de la tierra han contemplado la salvación de nuestro Dios',ci:'A'},
    '2028-12-31':{t:'Navidad',n:'Sagrada Familia',e:'Fiesta',c:'Blanco',ev:'Mt 2,13-15.19-23',tema:'Levántate, toma al niño y a su madre',ant:'Dichosos los que temen al Señor y siguen sus caminos',ci:'A'}
  };
  var COL={'Blanco':'#F5F5F0','Verde':'#4A7A3A','Morado':'#6A3D7A','Rojo':'#A03030','Rosa':'#C07090'};
  function pad(n){return n<10?'0'+n:''+n;}
  function nextSun(){var d=new Date();var dy=d.getDay();d.setDate(d.getDate()+(dy===0?0:7-dy));return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function getPsalmUrl(n,ci,t){
    var base='../salmos/';
    var c=ci.toLowerCase();
    var file=null;
    /* Adviento */
    var m=n.match(/^(I{1,3}V?|IV) Domingo de Adviento$/);
    if(m){var rom={'I':1,'II':2,'III':3,'IV':4};file='adviento-'+String(rom[m[1]]).padStart(2,'0');}
    /* Navidad */
    if(n==='Natividad del Señor')file='navidad-dia';
    if(n==='Sagrada Familia')file='sagrada-familia';
    if(n==='Santa María Madre de Dios')file='santa-maria';
    if(n==='II Domingo de Navidad')file='navidad-02';
    if(n==='Epifanía del Señor')file='epifania';
    if(n==='Bautismo del Señor')file='bautismo';
    /* Cuaresma */
    m=n.match(/^(I{1,3}V?|IV|V) Domingo de Cuaresma$/);
    if(m){var rom={'I':1,'II':2,'III':3,'IV':4,'V':5};file='cuaresma-'+String(rom[m[1]]).padStart(2,'0');}
    /* Semana Santa */
    if(n.indexOf('Ramos')!==-1)file='ramos';
    /* Pascua */
    if(n==='Domingo de Pascua')file='pascua-01';
    m=n.match(/^(I{1,3}V?|IV|V|VI|VII) Domingo de Pascua$/);
    if(m){var rom={'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7};var num=rom[m[1]];if(num)file='pascua-'+String(num).padStart(2,'0');}
    /* Ascensión */
    if(n.indexOf('Ascensi')!==-1)file='ascension';
    /* Pentecostés */
    if(n.indexOf('Pentecost')!==-1)file='pentecostes-dia';
    /* Solemnidades */
    if(n.indexOf('Trinidad')!==-1)file='trinidad';
    if(n.indexOf('Corpus')!==-1||n.indexOf('Cuerpo')!==-1)file='corpus';
    if(n==='Cristo Rey del Universo')file='ordinario-34';
    if(n==='Todos los Santos')return null;
    /* Ordinario */
    m=n.match(/(X{0,3})(I{1,3}V?|IV|V|VI|VII|VIII|IX|X)\s+Domingo del Tiempo Ordinario/);
    if(m){
      var rom={'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10,
               'XI':11,'XII':12,'XIII':13,'XIV':14,'XV':15,'XVI':16,'XVII':17,'XVIII':18,
               'XIX':19,'XX':20,'XXI':21,'XXII':22,'XXIII':23,'XXIV':24,'XXV':25,'XXVI':26,
               'XXVII':27,'XXVIII':28,'XXIX':29,'XXX':30,'XXXI':31,'XXXII':32,'XXXIII':33,'XXXIV':34};
      var full=m[1]+m[2];var num=rom[full];
      if(num)file='ordinario-'+String(num).padStart(2,'0');
    }
    if(!file)return null;
    /* Determine folder: tiempos vs ordinario */
    var folder;
    if(file.indexOf('ordinario-')===0){folder=c+'-ordinario';}
    else{folder=c+'-tiempos';}
    return base+folder+'/'+file+'.mp3';
  }
  function render(lit,key){
    var card=document.getElementById('lit-card');if(!card)return;
    var h='<div class="lit-season">'+lit.t+' \u00b7 Ciclo '+lit.ci+'</div>';
    h+='<div class="lit-name">'+lit.n+'</div>';
    if(lit.e)h+='<div class="lit-special">'+lit.e+'</div>';
    h+='<div class="lit-divider"></div>';
    h+='<div class="lit-gospel"><span class="lit-color-dot" style="background:'+(COL[lit.c]||'#F5F5F0')+'"></span>Evangelio: '+lit.ev+'</div>';
    h+='<div class="lit-theme">\u00ab'+lit.tema+'\u00bb</div>';
    var dd=parseInt(key.slice(8,10)),mm=parseInt(key.slice(5,7)),yyyy=key.slice(0,4);
    card.setAttribute('onclick','window.open("https://www.dominicos.org/predicacion/homilia/'+dd+'-'+mm+'-'+yyyy+'/lecturas/#:~:text=Salmo","_blank")');
    card.title='Ver lecturas del domingo';
    card.innerHTML=h;setTimeout(function(){card.classList.add('lit-visible');},50);
    /* ── Psalm button ── */
    var psUrl=getPsalmUrl(lit.n,lit.ci,lit.t);
    var psBtn=document.getElementById('lit-psalm-btn');
    var psLabel=document.getElementById('lit-psalm-label');
    if(psBtn&&psUrl){psBtn.style.display='flex';
      if(psLabel){psLabel.textContent=lit.ant?'Salmo: '+lit.ant:'Salmo responsorial';}
      psBtn.onclick=function(e){e.stopPropagation();
      var wrap=document.getElementById('psalm-player');
      if(!wrap){
        /* Build custom player */
        wrap=document.createElement('div');wrap.id='psalm-player';wrap.className='psalm-player';
        wrap.innerHTML='<button class="psalm-play-btn" id="psalm-pp"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg></button>'
          +'<div class="psalm-player-mid"><div class="psalm-progress-wrap" id="psalm-pw"><div class="psalm-progress-bar" id="psalm-pb"></div></div>'
          +'<div class="psalm-time" id="psalm-tm">0:00 / 0:00</div></div>'
          +'<button class="psalm-close-btn" id="psalm-cl"><svg viewBox="0 0 14 14"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/></svg></button>';
        psBtn.parentNode.insertBefore(wrap,psBtn.nextSibling);
        var au=document.createElement('audio');au.id='lit-psalm-audio';wrap.appendChild(au);
        var pp=document.getElementById('psalm-pp'),pb=document.getElementById('psalm-pb'),
            pw=document.getElementById('psalm-pw'),tm=document.getElementById('psalm-tm'),
            cl=document.getElementById('psalm-cl');
        function fmt(s){var m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;}
        au.addEventListener('timeupdate',function(){
          if(au.duration){pb.style.width=(au.currentTime/au.duration*100)+'%';tm.textContent=fmt(au.currentTime)+' / '+fmt(au.duration);}
        });
        au.addEventListener('ended',function(){pp.innerHTML='<svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg>';});
        pp.addEventListener('click',function(ev){ev.stopPropagation();
          if(au.paused){au.play();pp.innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>';}
          else{au.pause();pp.innerHTML='<svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg>';}
        });
        pw.addEventListener('click',function(ev){ev.stopPropagation();
          if(au.duration){var r=ev.offsetX/pw.offsetWidth;au.currentTime=r*au.duration;}
        });
        cl.addEventListener('click',function(ev){ev.stopPropagation();au.pause();au.src='';wrap.classList.remove('visible');});
      }
      var au=document.getElementById('lit-psalm-audio');
      au.src=psUrl;au.play();wrap.classList.add('visible');
      document.getElementById('psalm-pp').innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>';
    };
    }else if(psBtn){psBtn.style.display='none';}
  }
  function go(){
    var card=document.getElementById('lit-card');if(!card)return;
    var key=nextSun();
    if(D[key]){render(D[key],key);return;}
    /* If exact date not found, try Gemini as fallback */
    card.innerHTML='<div class="lit-loading">Consultando calendario lit\u00fargico\u2026</div>';
    var sun=new Date(key+'T12:00:00');
    var dh=sun.toLocaleDateString('es-PE',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    if(typeof _gk!=='function'){card.innerHTML='<div class="lit-error">Calendario no disponible</div>';return;}
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+_gk(),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:'Para el domingo '+dh+' calendario lit\u00fargico cat\u00f3lico, responde SOLO JSON: {"t":"Pascua","n":"nombre","e":"especial o vacio","c":"Blanco","ev":"Jn 20,19-31","tema":"frase","ci":"A"}'}]}],tools:[{google_search:{}}],generationConfig:{temperature:0,maxOutputTokens:300}})
    }).then(function(r){return r.json();}).then(function(data){
      var text='';data.candidates[0].content.parts.forEach(function(p){if(p.text)text+=p.text;});
      var m=text.match(/\{[\s\S]*\}/);if(m)render(JSON.parse(m[0]),key);
      else card.innerHTML='<div class="lit-error">Calendario no disponible</div>';
    }).catch(function(){card.innerHTML='<div class="lit-error">Calendario no disponible</div>';});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
  /* Exponer el calendario litúrgico para que otros módulos (como Setlist) lean nombres exactos. */
  window.LITURGICAL_DATA = D;
})();
