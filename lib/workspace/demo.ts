/** A tiny shop dataset to try the Data Model workspace with one click. */
export const DEMO_FILES: { name: string; text: string }[] = [
  {
    name: "customers.csv",
    text: `customer_id,full_name,email,country,signup_date
1,Ana Silva,ana@example.com,BR,2023-02-11
2,Ben Okafor,ben@example.com,NG,2023-03-02
3,Chen Wei,chen@example.com,CN,2023-04-19
4,Divya Rao,divya@example.com,IN,2023-05-07
5,Eli Cohen,eli@example.com,IL,2023-06-23`,
  },
  {
    name: "products.csv",
    text: `product_id,name,category,unit_price
P-100,Espresso Beans 1kg,coffee,18.50
P-101,Pour-over Kettle,equipment,42.00
P-102,Ceramic Mug,merch,12.00
P-103,Paper Filters x100,equipment,6.75`,
  },
  {
    name: "orders.csv",
    text: `order_id,customer_id,order_date,status,shipped_at
1001,1,2024-01-05,shipped,2024-01-06T10:00:00Z
1002,2,2024-01-06,shipped,2024-01-07T09:30:00Z
1003,1,2024-01-09,cancelled,
1004,4,2024-01-11,shipped,2024-01-12T14:10:00Z
1005,3,2024-01-12,processing,
1006,9,2024-01-13,processing,`,
  },
  {
    name: "order_items.csv",
    text: `order_item_id,order_id,product_id,quantity,line_total
1,1001,P-100,2,37.00
2,1001,P-102,1,12.00
3,1002,P-101,1,42.00
4,1003,P-103,3,20.25
5,1004,P-100,1,18.50
6,1004,P-103,2,13.50
7,1005,P-102,4,48.00`,
  },
];
