This is going to be a mobile app that's simple yet smart budget tracker for everyone to use. Core functionalities are

1. Budget tracking

Simple UI where you can add, subtract of what you used. Simple big UI so adding and subtracting gives the most straight forward UX.

2. Budget planner

Here is where they set the budget. This is where they set monthly income and outgoings. They can set up planned or one times. Once they set up monthly incomes, they can set percentage for % spend, % save and % etc. Other than base budgeter, they can set additional budget plans that will effect the % mathmatically based on the amount / time etc.

3. Savings tracker

People go over savings. This is for people to see if they are on track of savings / percentage / planner or if they are out of trajectory and needs to adjust the planner. They add budgets and stuff and if it's going out of trajectory and needs to be readjusted on their personal planning (ex - in this trajectory if they cannot match the savings they planned for next months travel) we need to give a new plan and percentage they need to save. This could be mathmatical actually probably no AI here just simple math equation.

4. AI budget planner

In the budget planner, if they say "I want to buy a good TV" (big spend budget) or "I want to travel hong kong" - we spin of travel palnner + budgeter to talk with the agent to go through phases to see what kind of travel / spending / even models they are looking for, how much it's gonna need (research) and then add the savings plan for them.

5. Savings util

this includes OCR service like receipt scanner or pdf bill scanner etc. Any other that might be useful feel free to add and report back.

The backend for this will be hosted on GCP separately (create BE with fastapi in this same repo with proper CI CD, argocd sounds good for infra) and all the service calls should be made to the backend. However, for data utilize the saves on local instead of backend cause it's expensive :c. Backend purely leave like agentic conversations / mut be run in backend stuff (really don't see other than AI but thoroughly explore). The AI keys will be served from the User side, so save locally and send it with when dealing with it. Mainly use openai as main source of agentic maybe we will add other providers later.
