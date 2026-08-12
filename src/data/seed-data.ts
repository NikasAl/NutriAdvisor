import type { FoodProduct, DishIngredientData } from '@/lib/types';

export interface SeedProduct {
  id: string;
  name: string;
}

export interface SeedDish {
  id: string;
  name: string;
  ingredients: DishIngredientData[];
}

// Preset products — populated on first launch when database is empty.
// Dishes reference products by these IDs, so IDs must remain stable.
export const SEED_PRODUCTS: SeedProduct[] = [
  { id: 'aa6b2c73-2dd8-43c1-90dc-d1a40c16a1e8', name: 'Яблоко' },
  { id: '95148b37-44bf-4e35-bb05-dee67e95ede6', name: 'Помидор' },
  { id: '0e93824f-e726-4b4a-a026-3529fbc03cc9', name: 'Яйцо' },
  { id: '0f172af2-68a6-4c69-815f-f261df6403ed', name: 'Чечевица' },
  { id: '4c7ed264-2d85-48e3-838e-1fae1e53a736', name: 'Гречка' },
  { id: '0cc48b15-9a26-49d1-93b7-94690fafe572', name: 'Сыр' },
  { id: 'a365f0eb-d4a4-4a4c-9922-539fffb91ca9', name: 'Лук' },
  { id: 'e6af9f7a-0081-4469-a44c-bc053b984946', name: 'Морковка' },
  { id: 'f57a86e5-121a-4064-a291-3164005ae749', name: 'Вода' },
  { id: '5c164310-64fa-4946-a0ae-245cb7f70164', name: 'Перец болгарский' },
  { id: '09209691-e2b2-4a8a-ac3d-eeed14ac01aa', name: 'Дыня' },
  { id: 'e4375b92-a787-4161-b898-e4840799ea9a', name: 'Конфета шоколадная' },
  { id: '4397c0af-8119-43fe-a9a9-73c2dca74bc5', name: 'Соус томатный' },
  { id: 'e0999218-0a0e-4bf2-94d7-ad7815670a48', name: 'Буряк' },
  { id: 'b66ab1d9-ab49-45be-864f-92eb0e701b6f', name: 'Рис' },
  { id: 'db4a6d6e-3baa-40bf-a5db-c60616363d30', name: 'Смалец' },
  { id: '93fc4d89-749f-4788-b702-6a11297cc897', name: 'Сметана' },
  { id: '8c2c9ea0-cdc0-4305-8cc6-c7a6ad2d5bb5', name: 'Хлеб солодовый' },
  { id: 'a806d7eb-ca62-43de-b499-a14f5374fe75', name: 'Черешня' },
  { id: '399ee5e5-c903-4873-8993-cf08538a8be5', name: 'Курага' },
  { id: '2dd5de93-b7cc-4466-b2a3-d08896958cf7', name: 'Чернослив' },
  { id: '02fbed75-8cb6-4f53-81f5-cf4b1316f3d5', name: 'Фарш куриный' },
  { id: 'a005959c-6a39-4127-ba62-5e0e2ad17153', name: 'Фарш свино-говяжий' },
  { id: '7d44049b-be46-48d2-9c00-f9bb88e483b3', name: 'Творог обезжиренный' },
  { id: '575f7197-34d0-45ad-96b7-746592ca0d29', name: 'Орех миндальный' },
  { id: '24870e8d-b174-4ce7-ab36-ed76d31651a0', name: 'Масло льняное' },
  { id: '285646eb-8295-44a0-8bb2-5171373598fc', name: 'Масло горчичное' },
  { id: 'f75798b7-1125-404e-affa-552c4918b00f', name: 'Масло оливковое' },
  { id: '87437b34-7799-475d-ac20-e7138cb271e7', name: 'Оливки вяленые' },
  { id: 'f2473f55-8e2d-4db0-a0aa-44d449fe547e', name: 'Молоко 2.5%' },
  { id: 'ec1ecacc-58b2-414c-bfca-d994d8c6b263', name: 'Молоко топленое 2.5%' },
  { id: 'a1842b69-9db1-4725-9cda-a5909582f5e9', name: 'Огурец' },
  { id: '2f28f595-0d16-4aea-90d3-f08443e1a622', name: 'Укроп' },
  { id: '0b29cd61-758a-4867-b53c-fc0d7e5d56d9', name: 'Мацони' },
  { id: '3e47dad1-f5f0-4aa6-bd4f-5f122a6b69db', name: 'Котлеты из куриной грудки' },
  { id: 'a35e2e8e-3941-44b1-ad86-8f4a6bdf1027', name: 'Чак-чак медовый' },
  { id: '1508e756-ea60-43ff-ab42-5be7dbdd648d', name: 'Блинчики с мясом' },
  { id: 'e406e78d-bc58-4d7e-8ab9-4255523803ab', name: 'Варенье абрикосовое' },
  { id: '04a78035-0aad-403c-8e4d-8acc6ea99efa', name: 'Вареная колбаса' },
  { id: 'd5eccc61-affc-45c3-9d3c-618e184f36fe', name: 'Апельсин' },
  { id: '0459f65c-7d7b-4827-945b-1e1758fe2764', name: 'Картошка' },
  { id: 'c685207b-ebf6-48b7-8db1-d5d34a5dabcf', name: 'Хлеб ржано-пшеничный' },
  { id: '7a0809ed-1485-40bd-88ce-6bf622481f6d', name: 'Ветчина' },
  { id: '0560c685-4c87-4952-bfc8-52ff5e79a83c', name: 'Лаваш тонкий' },
  { id: '4722ad87-1912-4966-aeb2-d7b37a9533cc', name: 'Профитроль' },
  { id: 'e9de5ced-86c2-409e-9ce3-0c11c96af1e8', name: 'Лук зелёный' },
  { id: '6b448db9-5cf8-4f59-a0c1-e5173314be95', name: 'Шампиньоны' },
  { id: '1a3fb6dd-358c-41a0-b270-2d8b713d2161', name: 'Капуста' },
  { id: 'efe5ba72-a20f-426f-a961-b87b9a8d5816', name: 'Тесто' },
  { id: 'a1e48828-6c09-4e57-b369-daad305b2cc9', name: 'Хлебец' },
  { id: '37dcb03b-f5f5-4683-98db-21b5245e26bb', name: 'Греческий йогурт' },
  { id: '82ef529d-4d11-471a-a0ae-9b844250babd', name: 'Персик' },
  { id: '8d59cfa1-1ead-4e50-a581-33ddc3da4478', name: 'Соевая спаржа' },
  { id: 'ac05db56-9795-4440-821b-163283401893', name: 'Ветчина из грудки индейки' },
  { id: 'ba25b24e-c37a-488a-86cf-65c0755093a8', name: 'Моцарелла' },
  { id: 'c00d59ae-6b38-4988-a2f6-183e76fdcd0f', name: 'Отруби ржаные экструдированные' },
];

export const SEED_DISHES: SeedDish[] = [
  {
    id: '9d660d7c-4586-4396-811b-4e4f198bd717',
    name: 'Чечевичник',
    ingredients: [
      { productId: '4c7ed264-2d85-48e3-838e-1fae1e53a736', weightGrams: 50 },
      { productId: '0f172af2-68a6-4c69-815f-f261df6403ed', weightGrams: 60 },
      { productId: '0e93824f-e726-4b4a-a026-3529fbc03cc9', weightGrams: 70 },
      { productId: 'f57a86e5-121a-4064-a291-3164005ae749', weightGrams: 150 },
    ],
  },
  {
    id: '3bd60592-4cce-4722-a56b-b6d358273761',
    name: 'Салат морковно-яблочный',
    ingredients: [
      { productId: 'e6af9f7a-0081-4469-a44c-bc053b984946', weightGrams: 50 },
      { productId: 'aa6b2c73-2dd8-43c1-90dc-d1a40c16a1e8', weightGrams: 50 },
    ],
  },
  {
    id: '8b86c780-34e3-4a4b-9ed7-57394bec9ac0',
    name: 'Салат овощной',
    ingredients: [
      { productId: 'a1842b69-9db1-4725-9cda-a5909582f5e9', weightGrams: 30 },
      { productId: '95148b37-44bf-4e35-bb05-dee67e95ede6', weightGrams: 30 },
      { productId: '5c164310-64fa-4946-a0ae-245cb7f70164', weightGrams: 30 },
      { productId: 'a365f0eb-d4a4-4a4c-9922-539fffb91ca9', weightGrams: 5 },
      { productId: '2f28f595-0d16-4aea-90d3-f08443e1a622', weightGrams: 5 },
      { productId: '285646eb-8295-44a0-8bb2-5171373598fc', weightGrams: 3 },
    ],
  },
  {
    id: 'beb8ca14-aa43-44d5-9892-c760adb44f91',
    name: 'Перец фаршированный',
    ingredients: [
      { productId: '5c164310-64fa-4946-a0ae-245cb7f70164', weightGrams: 50 },
      { productId: 'e6af9f7a-0081-4469-a44c-bc053b984946', weightGrams: 25 },
      { productId: '02fbed75-8cb6-4f53-81f5-cf4b1316f3d5', weightGrams: 50 },
      { productId: 'b66ab1d9-ab49-45be-864f-92eb0e701b6f', weightGrams: 25 },
      { productId: '93fc4d89-749f-4788-b702-6a11297cc897', weightGrams: 3 },
      { productId: '4397c0af-8119-43fe-a9a9-73c2dca74bc5', weightGrams: 3 },
      { productId: 'db4a6d6e-3baa-40bf-a5db-c60616363d30', weightGrams: 0.1 },
      { productId: 'a365f0eb-d4a4-4a4c-9922-539fffb91ca9', weightGrams: 3 },
    ],
  },
  {
    id: '16420792-6131-47bb-8131-ca04a488448c',
    name: 'Шакшука',
    ingredients: [
      { productId: '95148b37-44bf-4e35-bb05-dee67e95ede6', weightGrams: 30 },
      { productId: 'a365f0eb-d4a4-4a4c-9922-539fffb91ca9', weightGrams: 10 },
      { productId: '5c164310-64fa-4946-a0ae-245cb7f70164', weightGrams: 30 },
      { productId: '4397c0af-8119-43fe-a9a9-73c2dca74bc5', weightGrams: 5 },
      { productId: '0e93824f-e726-4b4a-a026-3529fbc03cc9', weightGrams: 25 },
      { productId: '2f28f595-0d16-4aea-90d3-f08443e1a622', weightGrams: 3 },
      { productId: 'e9de5ced-86c2-409e-9ce3-0c11c96af1e8', weightGrams: 3 },
    ],
  },
  {
    id: '1dcb5cb7-2916-402e-b38b-d60345326811',
    name: 'Окрошка',
    ingredients: [
      { productId: '0459f65c-7d7b-4827-945b-1e1758fe2764', weightGrams: 30 },
      { productId: 'e0999218-0a0e-4bf2-94d7-ad7815670a48', weightGrams: 15 },
      { productId: '0e93824f-e726-4b4a-a026-3529fbc03cc9', weightGrams: 15 },
      { productId: '04a78035-0aad-403c-8e4d-8acc6ea99efa', weightGrams: 15 },
      { productId: 'a1842b69-9db1-4725-9cda-a5909582f5e9', weightGrams: 30 },
      { productId: 'e9de5ced-86c2-409e-9ce3-0c11c96af1e8', weightGrams: 5 },
      { productId: '2f28f595-0d16-4aea-90d3-f08443e1a622', weightGrams: 5 },
    ],
  },
  {
    id: '1b921060-1162-48c2-82e6-37f4cc474717',
    name: 'Вареники с капустой',
    ingredients: [
      { productId: 'efe5ba72-a20f-426f-a961-b87b9a8d5816', weightGrams: 2 },
      { productId: '1a3fb6dd-358c-41a0-b270-2d8b713d2161', weightGrams: 6 },
    ],
  },
  {
    id: 'faa5b2fb-19bd-480e-b125-bd5c508503a8',
    name: 'Плов с грибами',
    ingredients: [
      { productId: 'b66ab1d9-ab49-45be-864f-92eb0e701b6f', weightGrams: 70 },
      { productId: 'e6af9f7a-0081-4469-a44c-bc053b984946', weightGrams: 10 },
      { productId: '6b448db9-5cf8-4f59-a0c1-e5173314be95', weightGrams: 10 },
      { productId: 'a365f0eb-d4a4-4a4c-9922-539fffb91ca9', weightGrams: 5 },
      { productId: '4397c0af-8119-43fe-a9a9-73c2dca74bc5', weightGrams: 5 },
    ],
  },
];
