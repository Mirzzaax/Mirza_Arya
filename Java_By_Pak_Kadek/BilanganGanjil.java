/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package javaapplication1;

/**
 *
 * @author ASUS
 */
import java.util.Scanner;
public class BilanganGanjil {
    public static void main(String[] args) {
        Scanner input = new Scanner(System.in);
        System.out.println("Masukan angka :");
        int angka = input.nextInt();
        if (angka % 2 == 0) {
            System.out.println(angka + " adalah angka Genap.");
        } else {
            System.out.println(angka + " adalah angka Ganjil.");
        }

    }
}
